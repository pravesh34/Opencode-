package com.opengateway.app

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Extracts embedded binaries from assets/bin/arm64-v8a/.
 * Binaries are fetched in CI (never committed):
 *  - opencode (linux-arm64-musl, PT_INTERP patched by CI to
 *    /data/data/com.opengateway.app/files/bin/ld-musl-aarch64.so.1)
 *  - busybox  (Alpine musl ET_DYN build, same interpreter)
 *  - musl runtime: ld-musl-aarch64.so.1 + libc.musl-aarch64.so.1
 *  - libstdc++.so.6 + libgcc_s.so.1 (opencode NEEDED entries)
 *
 * Layout after install:
 *  - filesDir/bin/{4 .so libraries}         (dlopen works here; this is their home)
 *  - <execSlot>/bin/{opencode,busybox}      (execve only works in the probed slot)
 *  - filesDir/workspace/                    (opencode cwd, user projects)
 *
 * filesDir cannot exec() due to SELinux (see BinSlots); the exec slot is probed at
 * runtime — no user action needed. Fully in-app.
 */
object AssetInstaller {
  private const val VERSION_FILE = ".bin_version"
  private const val ASSET_ROOT = "bin/arm64-v8a"
  const val TARGET_VERSION = "v2.1.2"

  /** load-bearing: keep in sync with android.yml (paths + patchelf targets). */
  val LIBRARIES = listOf(
    "ld-musl-aarch64.so.1",
    "libc.musl-aarch64.so.1",
    "libstdc++.so.6",
    "libgcc_s.so.1",
  )
  private val EXECUTABLES = listOf("opencode", "busybox")

  private val ALL = LIBRARIES + EXECUTABLES

  @Volatile private var cachedExecSlot: File? = null

  /** filesDir/bin — library home (dlopen OK here). */
  private fun libDir(ctx: Context) = File(ctx.filesDir, "bin").apply { mkdirs() }

  /** Active exec slot dir (probed). Reprobes if the cached one disappears. */
  fun execDir(ctx: Context): File {
    cachedExecSlot?.let { if (it.exists()) return it }
    val winner = probe(ctx)
    cachedExecSlot = winner
    return winner
  }

  /** Force a fresh probe (Settings -> Re-run slot probe). */
  fun reprobe(ctx: Context): File {
    cachedExecSlot = null
    return execDir(ctx)
  }

  fun binDir(ctx: Context): File = execDir(ctx)
  fun opencodeBin(ctx: Context) = File(execDir(ctx), "opencode")

  fun workspaceDir(ctx: Context) = File(ctx.filesDir, "workspace").apply { mkdirs() }

  private fun probe(ctx: Context): File {
    // Cheap path: a cached probe marker in filesDir tells us the last winner; verify the
    // binary is still there, then skip re-probing (probing is fast anyway, so this is a bonus).
    val marker = File(ctx.filesDir, "exec_slot.txt")
    if (marker.exists()) {
      val path = marker.readText().trim()
      val dir = File(path)
      if (dir.isDirectory && File(dir, "busybox").canExecute()) {
        // verify it still execs (guard against tier changes across updates)
        try {
          runBusyboxEcho(File(dir, "busybox"))
          Log.i("AssetInstaller", "reuse probed exec slot $path")
          return dir
        } catch (_: Exception) {
          Log.i("AssetInstaller", "cached exec slot stale, reprobing")
        }
      }
    }
    val busyboxProbe = extractAssetTo(ctx, "busybox", File(ctx.cacheDir, ".probe"))
    val winner = BinSlots.probeExec(ctx, busyboxProbe) ?: File(ctx.filesDir, "bin")
    Log.i("AssetInstaller", "exec slot = ${winner.absolutePath}")
    try { marker.writeText(winner.absolutePath) } catch (_: Exception) {}
    busyboxProbe.delete()
    return winner
  }

  private fun runBusyboxEcho(busybox: File) {
    val p = ProcessBuilder(busybox.absolutePath, "echo", "ok").redirectErrorStream(true).start()
    val out = p.inputStream.bufferedReader().readText()
    val code = p.waitFor()
    if (code != 0 || !out.contains("ok")) throw RuntimeException("busybox echo failed code=$code out=$out")
  }

  fun installIfNeeded(ctx: Context) {
    val slot = execDir(ctx)
    val ver = File(slot, VERSION_FILE)
    if (ver.exists() && ver.readText().trim() == TARGET_VERSION && File(slot, "opencode").canExecute()) return
    install(ctx, force = false)
  }

  /** Wipe and re-extract everything (Settings -> Reinstall). Returns human-readable result. */
  @Synchronized
  fun forceReinstall(ctx: Context): String = install(ctx, force = true)

  private fun install(ctx: Context, force: Boolean): String {
    val slot = execDir(ctx)
    val lib = libDir(ctx)
    val log = StringBuilder()
    try {
      val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
      val base = "bin/$abi"
      // Libraries -> filesDir/bin (dlopen home; binaries reference this absolute path)
      for (name in LIBRARIES) {
        val out = File(lib, name)
        extractAsset(ctx, "$base/$name", out)
        out.setExecutable(true, false)
        log.append("lib $name (${out.length()} bytes)\n")
      }
      // Executables -> probed exec slot
      for (name in EXECUTABLES) {
        val out = File(slot, name)
        extractAsset(ctx, "$base/$name", out)
        out.setExecutable(true, false)
        log.append("exe $name -> ${out.absolutePath} (${out.length()} bytes)\n")
      }
      File(slot, VERSION_FILE).writeText(TARGET_VERSION)
      workspaceDir(ctx)
      // busybox applets (ls, cat, git...) for terminal
      try {
        ProcessBuilder(File(slot, "busybox").absolutePath, "--install", "-s", slot.absolutePath)
          .redirectErrorStream(true).start().waitFor()
      } catch (e: Exception) {
        log.append("busybox --install failed (non-fatal): ${e.message}\n")
      }
      log.append("extract complete ($TARGET_VERSION) slot=${slot.absolutePath}\n").toString()
    } catch (e: Exception) {
      Log.w("AssetInstaller", "extract failed: ${e.message}", e)
      "FAILED: ${e.message}\n${log}"
    }
  }

  private fun extractAssetTo(ctx: Context, assetName: String, out: File): File {
    out.parentFile?.mkdirs()
    val abi = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
    extractAsset(ctx, "bin/$abi/$assetName", out)
    return out
  }

  private fun extractAsset(ctx: Context, assetPath: String, out: File) {
    out.parentFile?.mkdirs()
    ctx.assets.open(assetPath).use { input -> out.outputStream().use { o -> input.copyTo(o) } }
    out.setExecutable(true, false)
  }

  /** Raw diagnostic dump for the Settings screen (no adb needed). */
  fun diagnostics(ctx: Context): String = buildString {
    appendLine("applicationId: ${ctx.packageName}")
    appendLine("filesDir: ${ctx.filesDir.absolutePath}")
    appendLine("abis: ${Build.SUPPORTED_ABIS.joinToString(",")}")
    appendLine("exec slot: ${execDir(ctx).absolutePath}")
    for (c in BinSlots.candidates(ctx)) {
      appendLine("slot ${c.name} (${c.dir.absolutePath}): ${c.dir.list()?.joinToString(",") ?: "(absent)"}")
    }
    for (name in ALL) {
      val inLib = File(libDir(ctx), name)
      val inSlot = File(execDir(ctx), name)
      appendLine("$name: files/bin=${inLib.exists()}(${if (inLib.exists()) inLib.length() else -1}) slot=${inSlot.exists()}(${if (inSlot.exists()) inSlot.length() else -1})")
    }
    val ver = File(execDir(ctx), VERSION_FILE)
    appendLine("installed version: ${if (ver.exists()) ver.readText().trim() else "(none)"} (target $TARGET_VERSION)")
  }
}
