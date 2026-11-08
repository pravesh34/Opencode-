package com.opengateway.app

import android.content.Context
import android.util.Log
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Dynamic model list from the embedded binary. Returns empty when the binary can't run — never fabricates names. */
object ModelFetcher {
  suspend fun fetchModels(ctx: Context, provider: String): List<String> = withContext(Dispatchers.IO) {
    AssetInstaller.installIfNeeded(ctx)
    val bin = AssetInstaller.opencodeBin(ctx)
    if (!bin.exists() || !bin.canExecute()) return@withContext emptyList()
    try {
      val loader = AssetInstaller.loaderBin(ctx)
      val proc = ProcessBuilder(loader.absolutePath, bin.absolutePath, "models").apply {
        directory(AssetInstaller.workspaceDir(ctx))
        redirectErrorStream(true)
      }.start()
      val out = proc.inputStream.bufferedReader().readText().trim()
      proc.waitFor()
      // `opencode models` output is newline list like `provider/model`; filter to provider
      val lines = out.split("\n").map { it.trim() }.filter { it.isNotBlank() && !it.startsWith("[") && !it.startsWith("error", ignoreCase = true) }
      val filtered = lines.filter { it.startsWith("$provider/", ignoreCase = true) }
      if (filtered.isNotEmpty()) return@withContext filtered
      if (lines.isNotEmpty()) return@withContext lines
    } catch (e: Exception) {
      Log.w("ModelFetcher", "opencode models failed", e)
    }
    emptyList()
  }
}
