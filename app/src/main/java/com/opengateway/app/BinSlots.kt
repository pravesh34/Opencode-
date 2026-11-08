package com.opengateway.app

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Chooses where the embedded executables (opencode, busybox) actually live on-device.
 *
 * Android's SELinux policy denies execve() from filesDir (app_data_file, noexec) even when
 * the file is marked executable — so an app cannot reliably run binaries from its private
 * files. codeCacheDir / cacheDir are the candidate locations that may allow exec. We probe
 * them at runtime with a real busybox invocation and use the first one that actually runs.
 *
 * Libraries (musl loader, libc, libstdc++, libgcc) are NOT subject to the exec block —
 * dlopen works from filesDir — so they always live in filesDir/bin and binaries find them
 * through the absolute PT_INTERP + absolute RPATH baked in by CI (see android.yml).
 */
object BinSlots {

  data class Candidate(val name: String, val dir: File)

  private const val TAG = "BinSlots"

  fun candidates(ctx: Context): List<Candidate> = listOf(
    Candidate("codeCache", File(ctx.codeCacheDir, "bin")),
    Candidate("cache", File(ctx.cacheDir, "bin")),
    Candidate("files", File(ctx.filesDir, "bin")),
  )

  /** Extracted executable dir options share the same file names. */
  val EXECUTABLES = listOf("opencode", "busybox")

  /**
   * Probe each candidate by actually running its busybox placeholder (a tiny probe script
   * is not enough — wrong format/SELinux failures only show on real exec).
   * Returns first dir that executes busybox to completion.
   */
  fun probeExec(ctx: Context, busyboxSrc: File): File? {
    for (c in candidates(ctx)) {
      try {
        c.dir.mkdirs()
        val probe = File(c.dir, "busybox")
        if (probe.absolutePath != busyboxSrc.absolutePath) {
          busyboxSrc.copyTo(probe, overwrite = true)
        }
        probe.setExecutable(true)
        val code = runBusyboxEcho(probe)
        Log.i(TAG, "probe ${c.name} (${c.dir.absolutePath}) -> ${if (code == 0) "OK" else "fail($code)"}")
        if (code == 0) return c.dir
      } catch (e: Exception) {
        Log.w(TAG, "probe ${c.name} failed", e)
      }
    }
    return null
  }

  private fun runBusyboxEcho(busybox: File): Int {
    val p = ProcessBuilder(busybox.absolutePath, "echo", "ok").redirectErrorStream(true).start()
    val out = p.inputStream.bufferedReader().readText()
    val code = p.waitFor()
    if (code != 0 || !out.contains("ok")) throw RuntimeException("busybox echo failed code=$code out=$out")
    return code
  }
}
