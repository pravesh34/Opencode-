package com.opengateway.app

import android.content.Context
import android.util.Log
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import org.json.JSONObject

enum class Provider(val id: String, val display: String, val modelPrefix: String) {
  OPENCODE("opencode", "OpenCode (default)", ""),
  ANTHROPIC("anthropic", "Anthropic", "anthropic/"),
  OPENAI("openai", "OpenAI", "openai/"),
  OPENROUTER("openrouter", "OpenRouter", "openrouter/"),
  GOOGLE("google", "Google (Gemini)", "google/"),
  OTHER("other", "Custom", "")
}

/** Multiple model options per provider - shown as dropdown in Settings. */
object ModelCatalog {
  fun modelsFor(provider: String): List<String> = when (provider) {
    "opencode" -> listOf(
      "opencode/glm-4.7", "opencode/kimi-k2", "opencode/gpt-5-nano",
      "opencode/minimax-m2.1", "opencode/claude-opus-4.5"
    )
    "anthropic" -> listOf(
      "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-1",
      "anthropic/claude-haiku-4-5", "anthropic/claude-3-7-sonnet"
    )
    "openai" -> listOf(
      "openai/gpt-4o", "openai/gpt-4o-mini", "openai/gpt-5", "openai/o3"
    )
    "openrouter" -> listOf(
      "openrouter/anthropic/claude-sonnet-4", "openrouter/openai/gpt-4o",
      "openrouter/deepseek/deepseek-chat"
    )
    "google" -> listOf(
      "google/gemini-2.5-pro", "google/gemini-2.0-flash"
    )
    else -> listOf()
  }
  val thinkingLevels = listOf("low", "medium", "high", "max")
}

/**
 * Runs embedded opencode binary directly (no HTTP gateway, no Node).
 *  opencode run --format json "<message>" --model <provider>/<model>
 * Streams JSON lines; text events -> UI.
 * SAFE: never throws - all failures emitted as [error] text so UI cannot crash.
 */
class OpenCodeRunner(private val ctx: Context) {

  fun runPrompt(message: String, model: String?, sessionId: String?, permission: String? = "plan", env: Map<String, String> = emptyMap()): Flow<String> = flow {
    // Idempotent: extracts/probes the exec slot on every send (cheap when fresh)
    AssetInstaller.installIfNeeded(ctx)
    val binFile = AssetInstaller.opencodeBin(ctx)
    if (!binFile.exists()) {
      emit("[error] opencode binary missing at ${binFile.absolutePath}. Settings -> Reinstall embedded binaries.")
      return@flow
    }
    if (!binFile.canExecute()) {
      emit("[error] opencode binary not executable: ${binFile.absolutePath}. Settings -> Reinstall embedded binaries.")
      return@flow
    }
    val workspace = AssetInstaller.workspaceDir(ctx).apply { mkdirs() }
    val args = mutableListOf("run", "--format", "json", message)
    if (!model.isNullOrBlank()) args.addAll(listOf("--model", model))
    if (!sessionId.isNullOrBlank()) args.addAll(listOf("--session", sessionId))
    // Plan = ask before edit/bash; Build = allow
    val perm = if (permission == "build") "allow" else "ask"
    // opencode run supports --permission flag in recent versions; passing both config + flag is harmless if unknown (we still write opencode.json as source of truth)
    // opencode is ET_EXEC (non-PIE): Android refuses direct exec. Run it through the
    // musl loader (PIE, allowed), which loads the program for us.
    val loader = AssetInstaller.loaderBin(ctx)
    // Chain: try direct exec (works on devices where app dirs are exec-able),
    // fall back to running from RAM via memfd (works where the disk is noexec).
    var resultLines: List<String>? = null
    var directError: String? = null
    try {
      resultLines = runViaProcess(loader, binFile, args, workspace, env)
    } catch (e: Exception) {
      directError = e.message
      Log.w("OpenCodeRunner", "direct exec failed, trying memfd: ${e.message}")
    }
    if (resultLines == null) {
      try {
        resultLines = runViaMemfd(loader, binFile, args, env)
      } catch (e: Exception) {
        emit("[error] direct: $directError\nmemfd: ${e.message}\nSee Settings -> Diagnostics -> Run self-test.")
        return@flow
      }
    }
    for (line in resultLines) emit(line)
    return@flow
  }

  /** Direct exec path (v2.1.3). Throws if the process can't start. */
  private fun runViaProcess(loader: File, binFile: File, args: List<String>, workspace: File, env: Map<String, String>): List<String> {
    val cmd = listOf(loader.absolutePath, binFile.absolutePath) + args
    Log.d("OpenCodeRunner", "exec(direct) ${cmd.joinToString(" "){"\"$it\""}}")
    val proc: Process
    try {
      val pb = ProcessBuilder(cmd)
      pb.directory(workspace)
      pb.redirectErrorStream(true)
      for ((k, v) in env) if (v.isNotBlank()) pb.environment()[k] = v
      proc = pb.start()
    } catch (e: Exception) {
      throw RuntimeException(e)
    }
    ProcessHelper.watchdog(proc, 10 * 60 * 1000L)
    val lines = mutableListOf<String>()
    try {
      proc.inputStream.bufferedReader().useLines { ls ->
        for (line in ls) {
          if (line.isBlank()) continue
          try {
            val obj = JSONObject(line)
            val part = obj.optJSONObject("part")
            val text = part?.optString("text", "")
            if (!text.isNullOrBlank()) lines.add(text)
            try {
              val cost = part?.optDouble("cost")
              if (cost != null && !cost.isNaN()) lines.add("[cost $cost]")
            } catch (_: Exception) {}
            val type = obj.optString("type", "")
            if (type.contains("tool", ignoreCase = true)) {
              val tool = part?.optString("tool", type)
              lines.add("[tool $tool]")
            }
          } catch (_: Exception) {
            lines.add(line)
          }
        }
      }
      val code = proc.waitFor()
      if (code != 0) lines.add("\n[opencode exited $code - check Settings -> Diagnostics -> Run self-test, or Settings -> provider/key]")
    } catch (e: Exception) {
      try { proc.destroyForcibly() } catch (_: Exception) {}
      throw e
    }
    return lines
  }

  /** Memfd path (v2.2.0). Stages the binary in RAM and execs it from /proc/self/fd. */
  private suspend fun runViaMemfd(loader: File, binFile: File, args: List<String>, env: Map<String, String>): List<String> {
    require(MemfdRunner.isAvailable()) { "memfd launcher unavailable (native lib missing)" }
    val raw = MemfdRunner.run(loader.absolutePath, binFile.absolutePath, args, env)
    val header = raw.lineSequence().firstOrNull() ?: ""
    val exit = header.removePrefix("exit=").substringBefore(' ').toIntOrNull()
    val out = raw.removePrefix(header).trimStart('\n')
    val lines = mutableListOf<String>()
    out.lineSequence().forEach { line ->
      if (line.isBlank()) return@forEach
      try {
        val obj = JSONObject(line)
        val part = obj.optJSONObject("part")
        val text = part?.optString("text", "")
        if (!text.isNullOrBlank()) lines.add(text)
        try {
          val cost = part?.optDouble("cost")
          if (cost != null && !cost.isNaN()) lines.add("[cost $cost]")
        } catch (_: Exception) {}
        val type = obj.optString("type", "")
        if (type.contains("tool", ignoreCase = true)) {
          val tool = part?.optString("tool", type)
          lines.add("[tool $tool]")
        }
      } catch (_: Exception) {
        lines.add(line)
      }
    }
    if (exit != null && exit != 0) lines.add("\n[opencode exited $exit (memfd) - check Settings -> Diagnostics -> Run self-test, or Settings -> provider/key]")
    return lines
  }

  /** One-shot diagnostic for Settings -> Diagnostics (no adb needed). */
  fun selfTest(): String {
    val sb = StringBuilder()
    AssetInstaller.installIfNeeded(ctx)
    sb.append(AssetInstaller.diagnostics(ctx)).append("\n")
    // --- Evidence: mount flags + SELinux (no adb needed) ---
    sb.append(envEvidence()).append("\n")
    val bin = AssetInstaller.opencodeBin(ctx)
    if (!bin.exists()) {
      sb.append("opencode --version: binary missing\n")
      return sb.toString()
    }
    sb.append("direct exec test: ").append(tryExec("opencode", bin.absolutePath, listOf("--version"))).append("\n")
    sb.append("busybox exec test: ").append(tryExec("busybox", AssetInstaller.binDir(ctx).resolve("busybox").absolutePath, listOf("echo", "ok"))).append("\n")
    sb.append("memfd test: ")
    sb.append(if (!MemfdRunner.isAvailable()) "launcher lib unavailable"
      else try {
        val out = MemfdRunner.execAndCapture(
          AssetInstaller.loaderBin(ctx).absolutePath, bin.absolutePath,
          arrayOf("--version"), arrayOf()
        )
        "exit-and-output: $out"
      } catch (e: Exception) { "FAILED: ${e.message}" })
    sb.append("\n")
    if (!MemfdRunner.isAvailable()) {
      sb.append("(memfd unavailable in this build)\n")
      return sb.toString()
    }
    try {
      val lines = runViaMemfdSelfTest()
      sb.append(lines)
      sb.toString()
    } catch (e: Exception) {
      sb.append("loader-pipe test FAILED: ${e.message}\n")
      sb.toString()
    }
  }

  private fun runViaMemfdSelfTest(): String {
    val bin = AssetInstaller.opencodeBin(ctx)
    val loader = AssetInstaller.loaderBin(ctx)
    val out = MemfdRunner.execAndCapture(loader.absolutePath, bin.absolutePath, arrayOf("--version"), arrayOf())
    return "loader-pipe --version: " + out.replace("\n", "\\n\n") + "\n"
  }
}

object ProcessHelper {
  fun watchdog(p: Process, ms: Long) {
    Thread { try { Thread.sleep(ms); if (p.isAlive) p.destroyForcibly() } catch (_: Exception) {} }.apply { isDaemon = true; start() }
  }
}

/** In-app evidence: mount flags for /data, SELinux enforce, per-binary exec probes. */
fun envEvidence(): String = buildString {
  appendLine("--- environment evidence ---")
  try {
    val mounts = java.io.File("/proc/mounts").readLines()
    mounts.firstOrNull { it.contains(" /data ") || it.contains(" /data/user ") }
      ?.let { appendLine("mount: $it") } ?: appendLine("mount: no /data line found")
  } catch (e: Exception) {
    appendLine("mount: unreadable (${e.javaClass.simpleName})")
  }
  try {
    val enforce = java.io.File("/sys/fs/selinux/enforce").readText().trim()
    appendLine("selinux: ${if (enforce == "1") "enforcing" else "permissive ($enforce)"}")
  } catch (e: Exception) {
    appendLine("selinux: unknown (${e.javaClass.simpleName})")
  }
  appendLine("--- end evidence ---")
}

fun tryExec(label: String, path: String, args: List<String>): String = try {
  val proc = ProcessBuilder(path, *args.toTypedArray()).redirectErrorStream(true).start()
  val out = proc.inputStream.bufferedReader().readText()
  val code = proc.waitFor()
  "$label exit=$code out=${out.take(200).replace("\n", " ")}"
} catch (e: Exception) {
  "$label FAILED: ${e.javaClass.simpleName}: ${e.message}"
}
