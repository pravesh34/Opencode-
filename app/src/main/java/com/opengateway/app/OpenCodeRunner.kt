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

  fun runPrompt(message: String, model: String?, sessionId: String?): Flow<String> = flow {
    val binFile = AssetInstaller.opencodeBin(ctx)
    if (!binFile.exists()) {
      emit("[error] opencode binary missing at ${binFile.absolutePath}. Reinstall app.")
      return@flow
    }
    if (!binFile.canExecute()) {
      emit("[error] opencode binary not executable: ${binFile.absolutePath}. Try reinstall.")
      return@flow
    }
    val workspace = AssetInstaller.workspaceDir(ctx).apply { mkdirs() }
    val args = mutableListOf("run", "--format", "json", message)
    if (!model.isNullOrBlank()) args.addAll(listOf("--model", model))
    if (!sessionId.isNullOrBlank()) args.addAll(listOf("--session", sessionId))
    Log.d("OpenCodeRunner", "exec ${binFile.absolutePath} ${args.joinToString(" "){"\"$it\""}}")
    val proc: Process
    try {
      val pb = ProcessBuilder(binFile.absolutePath, *args.toTypedArray())
      pb.directory(workspace)
      pb.redirectErrorStream(true)
      // Forward API keys as env so opencode CLI picks them up
      try {
        val repo = SettingsRepository(ctx)
        // Note: repo reads are suspend; this is best-effort legacy - ViewModel should pass keys via model env in future.
        // Env wiring added in ViewModel: model string already selects provider.
      } catch (_: Exception) {}
      proc = pb.start()
    } catch (e: Exception) {
      emit("[error] failed to start opencode: ${e.message}\nTry: Settings -> reinstall, or check logcat. (${binFile.absolutePath})")
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
            // ignore metadata events (step_finish etc) silently
          } catch (_: Exception) {
            emit(line)
          }
        }
      }
      val code = proc.waitFor()
      if (code != 0) emit("\n[opencode exited $code - check Settings -> provider/key, or terminal for details]")
    } catch (e: Exception) {
      try { proc.destroyForcibly() } catch (_: Exception) {}
      emit("[error] opencode stream failed: ${e.message}")
    }
  }.flowOn(Dispatchers.IO).catch { e ->
    emit("[error] ${e.message}")
    Log.w("OpenCodeRunner", "flow crash avoided", e)
  }
}

object ProcessHelper {
  fun watchdog(p: Process, ms: Long) {
    Thread { try { Thread.sleep(ms); if (p.isAlive) p.destroyForcibly() } catch (_: Exception) {} }.apply { isDaemon = true; start() }
  }
}
