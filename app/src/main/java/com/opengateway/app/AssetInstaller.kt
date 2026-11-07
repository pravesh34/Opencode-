package com.opengateway.app

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Extracts embedded binaries from assets/bin/arm64-v8a/ to filesDir/bin/.
 * Binaries are fetched in CI (not committed) to keep repo small:
 *  - opencode (linux-arm64 single binary from opencode-ai/opencode releases)
 *  - busybox (aarch64 static build, provides ls/cat/cp/grep/...)
 * Location after install:
 *  - filesDir/bin/opencode
 *  - filesDir/bin/busybox (+ symlinks via `busybox --install -s`)
 *  - filesDir/workspace/  (user projects, cwd for opencode + terminal)
 */
object AssetInstaller {
  private const val VERSION_FILE = ".bin_version"
  private const val ASSET_ROOT = "bin/arm64-v8a"
  const val TARGET_VERSION = "v2.0.0"

  fun binDir(ctx: Context) = File(ctx.filesDir, "bin")
  fun opencodeBin(ctx: Context) = File(binDir(ctx), "opencode")
  fun workspaceDir(ctx: Context) = File(ctx.filesDir, "workspace").apply { mkdirs() }

  @Synchronized
  fun installIfNeeded(ctx: Context) {
    val bin = binDir(ctx).apply { mkdirs() }
    val ver = File(bin, VERSION_FILE)
    if (ver.exists() && ver.readText().trim() == TARGET_VERSION && opencodeBin(ctx).canExecute()) return
    try {
      val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
      val base = "bin/$abi"
      for (name in listOf("opencode", "busybox")) {
        val out = File(bin, name)
        out.parentFile?.mkdirs()
        ctx.assets.open("$base/$name").use { input ->
          out.outputStream().use { output -> input.copyTo(output) }
        }
        out.setExecutable(true, false)
      }
      // busybox --install -s so `ls`, `cat` etc. work in terminal
      try {
        ProcessBuilder(File(bin, "busybox").absolutePath, "--install", "-s", bin.absolutePath)
          .redirectErrorStream(true).start().waitFor()
      } catch (_: Exception) {}
      ver.writeText(TARGET_VERSION)
      workspaceDir(ctx)
    } catch (e: Exception) {
      android.util.Log.w("AssetInstaller", "extract failed: ${e.message} - binaries must exist in assets/bin/arm64-v8a/ (fetched in CI)", e)
    }
  }
}
