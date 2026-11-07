package com.opengateway.app

import android.content.Context
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class OpencodeEvent(val type: String = "", val part: Part? = null, val sessionID: String? = null)
@Serializable data class Part(val text: String = "", val cost: Double? = null)

enum class Provider(val id: String, val display: String, val modelPrefix: String) {
  OPENCODE("opencode", "OpenCode (default)", ""),
  ANTHROPIC("anthropic", "Anthropic", "anthropic/"),
  OPENAI("openai", "OpenAI", "openai/"),
  OPENROUTER("openrouter", "OpenRouter", "openrouter/"),
  GOOGLE("google", "Google (Gemini)", "google/"),
  OTHER("other", "Custom", "")
}

/**
 * Runs embedded opencode binary directly (no HTTP gateway, no Node).
 *  opencode run --format json "<message>" --model <provider>/<model>
 * Streams JSON lines; text events -> UI.
 */
class OpenCodeRunner(private val ctx: Context) {
  private val json = Json { ignoreUnknownKeys = true }

  fun runPrompt(message: String, model: String?, sessionId: String?): Flow<String> = flow {
    val bin = AssetInstaller.opencodeBin(ctx).absolutePath
    val workspace = AssetInstaller.workspaceDir(ctx)
    val args = mutableListOf("run", "--format", "json", message)
    if (!model.isNullOrBlank()) args.addAll(listOf("--model", model))
    if (!sessionId.isNullOrBlank()) args.addAll(listOf("--session", sessionId))
    val pb = ProcessBuilder(bin, *args.toTypedArray())
    pb.directory(workspace)
    pb.redirectErrorStream(true)
    val proc = pb.start()
    // 10 min hard cap -> kill
    ProcessHelper.watchdog(proc, 10 * 60 * 1000L)
    proc.inputStream.bufferedReader().useLines { lines ->
      for (line in lines) {
        if (line.isBlank()) continue
        try {
          val ev = json.decodeFromString<OpencodeEvent>(line)
          if (!ev.part?.text.isNullOrBlank()) emit(ev.part!!.text)
        } catch (_: Exception) {
          emit(line) // fallback raw text
        }
      }
    }
    val code = proc.waitFor()
    if (code != 0) emit("\n[opencode exited $code - check Settings -> provider/key]")
  }.flowOn(Dispatchers.IO)
}

object ProcessHelper {
  fun watchdog(p: Process, ms: Long) {
    Thread { Thread.sleep(ms); try { if (p.isAlive) p.destroyForcibly() } catch (_: Exception) {} }.apply { isDaemon = true; start() }
  }
}
