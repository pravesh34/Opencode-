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
    Log.d("OpenCodeRunner", "exec ${binFile.absolutePath} ${args.joinToString(" "){"\"$it\""}} perm=$perm")
    val proc: Process
    try {
      val pb = ProcessBuilder(binFile.absolutePath, *args.toTypedArray())
      pb.directory(workspace)
      pb.redirectErrorStream(true)
      for ((k, v) in env) if (v.isNotBlank()) pb.environment()[k] = v
      proc = pb.start()
    } catch (e: Exception) {
      emit("[error] failed to start opencode: ${e.message}\nSee Settings -> Diagnostics -> Run self-test, or adb logcat -s OpenCodeRunner.")
      return@flow
    }
    ProcessHelper.watchdog(proc, 10 * 60 * 1000L)
    try {
      proc.inputStream.bufferedReader().useLines { lines ->
        for (line in lines) {
          if (line.isBlank()) continue
          // Try parse JSON event {type,part:{text}} else emit raw
          try {
            val obj = JSONObject(line)
            val part = obj.optJSONObject("part")
            val text = part?.optString("text", "")
            if (!text.isNullOrBlank()) emit(text)
            // Phase 4: cost + tool call events (displayed inline as [cost]/[tool])
            try {
              val cost = part?.optDouble("cost")
              if (cost != null && !cost.isNaN()) emit("[cost $cost]")
            } catch (_: Exception) {}
            val type = obj.optString("type", "")
            if (type.contains("tool", ignoreCase = true)) {
              val tool = part?.optString("tool", type)
              emit("[tool $tool]")
            }
          } catch (_: Exception) {
            emit(line)
          }
        }
      }
      val code = proc.waitFor()
      if (code != 0) emit("\n[opencode exited $code - check Settings -> Diagnostics -> Run self-test, or Settings -> provider/key]")
    } catch (e: Exception) {
      try { proc.destroyForcibly() } catch (_: Exception) {}
      emit("[error] opencode stream failed: ${e.message}")
    }
  }.flowOn(Dispatchers.IO).catch { e ->
    emit("[error] ${e.message}")
    Log.w("OpenCodeRunner", "flow crash avoided", e)
  }

  /** One-shot diagnostic for Settings -> Diagnostics (no adb needed). */
  fun selfTest(): String {
    val sb = StringBuilder()
    AssetInstaller.installIfNeeded(ctx)
    sb.append(AssetInstaller.diagnostics(ctx)).append("\n")
    val bin = AssetInstaller.opencodeBin(ctx)
    if (!bin.exists()) {
      sb.append("opencode --version: binary missing\n")
      return sb.toString()
    }
    return try {
      val proc = ProcessBuilder(bin.absolutePath, "--version")
        .directory(AssetInstaller.workspaceDir(ctx))
        .redirectErrorStream(true)
        .start()
      val out = proc.inputStream.bufferedReader().readText()
      val code = proc.waitFor()
      sb.append("opencode --version exit=").append(code).append("\n")
      sb.append(out)
      if (out.isBlank()) sb.append("(no output)\n")
      sb.toString()
    } catch (e: Exception) {
      sb.append("opencode --version FAILED to start: ").append(e).append("\n")
      sb.toString()
    }
  }
}

object ProcessHelper {
  fun watchdog(p: Process, ms: Long) {
    Thread { try { Thread.sleep(ms); if (p.isAlive) p.destroyForcibly() } catch (_: Exception) {} }.apply { isDaemon = true; start() }
  }
}
