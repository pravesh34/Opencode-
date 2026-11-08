package com.opengateway.app

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Extracts embedded binaries from assets/bin/arm64-v8a/ to filesDir/bin/.
 * Binaries are fetched in CI (not committed) to keep repo small:
 *  - opencode (linux-arm64-musl, PT_INTERP patched by CI to filesDir/bin/ld-musl-aarch64.so.1)
 *  - busybox  (Alpine musl ET_DYN build, same interpreter)
 *  - musl runtime: ld-musl-aarch64.so.1 + libc.musl-aarch64.so.1
 *  - libstdc++.so.6 + libgcc_s.so.1 (opencode NEEDED entries)
 *
 * Location after install:
 *  - filesDir/bin/{opencode,busybox,ld-musl-aarch64.so.1,libc.musl-aarch64.so.1,libstdc++.so.6,libgcc_s.so.1}
 *  - filesDir/workspace/  (user projects, cwd for opencode + terminal)
 */
object AssetInstaller {
  private const val VERSION_FILE = ".bin_version"
  private const val ASSET_ROOT = "bin/arm64-v8a"
  const val TARGET_VERSION = "v2.1.1"

  /** Package-private list of files to extract (load-bearing: keep in sync with android.yml). */
  private val BUNDLED_FILES = listOf(
    "opencode",
    "busybox",
    "ld-musl-aarch64.so.1",
    "libc.musl-aarch64.so.1",
    "libstdc++.so.6",
    "libgcc_s.so.1",
  )

  fun binDir(ctx: Context) = File(ctx.filesDir, "bin")
  fun opencodeBin(ctx: Context) = File(binDir(ctx), "opencode")
  fun workspaceDir(ctx: Context) = File(ctx.filesDir, "workspace").apply { mkdirs() }

  @Synchronized
  fun installIfNeeded(ctx: Context) {
    val bin = binDir(ctx).apply { mkdirs() }
    val ver = File(bin, VERSION_FILE)
    if (ver.exists() && ver.readText().trim() == TARGET_VERSION && opencodeBin(ctx).canExecute()) return
    forceReinstall(ctx)
  }

  /** Wipe and re-extract everything (Settings -> Reinstall). Returns human-readable result. */
  @Synchronized
  fun forceReinstall(ctx: Context): String {
    val bin = binDir(ctx).apply { mkdirs() }
    return try {
      val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
      val base = "bin/$abi"
      val log = StringBuilder()
      for (name in BUNDLED_FILES) {
        val out = File(bin, name)
        out.parentFile?.mkdirs()
        val input = try { ctx.assets.open("$base/$name") } catch (e: Exception) {
          log.append("MISSING asset $name\n"); throw e
        }
        input.use { i -> out.outputStream().use { o -> i.copyTo(o) } }
        out.setExecutable(true, false)
        log.append("ok $name (${out.length()} bytes)\n")
      }
      File(bin, VERSION_FILE).writeText(TARGET_VERSION)
      workspaceDir(ctx)
      // busybox applets (ls, cat, git...) for terminal
      try {
        ProcessBuilder(File(bin, "busybox").absolutePath, "--install", "-s", bin.absolutePath)
          .redirectErrorStream(true).start().waitFor()
      } catch (e: Exception) {
        log.append("busybox --install failed (non-fatal): ${e.message}\n")
      }
      log.append("extract complete ($TARGET_VERSION)\n").toString()
    } catch (e: Exception) {
      android.util.Log.w("AssetInstaller", "extract failed: ${e.message}", e)
      "FAILED: ${e.message}"
    }
  }

  /** Raw diagnostic dump for the Settings screen (no adb needed). */
  fun diagnostics(ctx: Context): String = buildString {
    appendLine("applicationId: ${ctx.packageName}")
    appendLine("filesDir: ${ctx.filesDir.absolutePath}")
    appendLine("abis: ${Build.SUPPORTED_ABIS.joinToString(",")}")
    appendLine("bin dir: ${binDir(ctx).absolutePath}")
    for (name in BUNDLED_FILES) {
      val f = File(binDir(ctx), name)
      appendLine("$name: exists=${f.exists()} canExecute=${f.canExecute()} size=${if (f.exists()) f.length() else -1}")
    }
    val ver = File(binDir(ctx), VERSION_FILE)
    appendLine("installed version: ${if (ver.exists()) ver.readText().trim() else "(none)"} (target $TARGET_VERSION)")
  }
}
