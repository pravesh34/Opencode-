package com.opengateway.app

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Runs the opencode binary from RAM via memfd when Android's noexec mount blocks
 * executing files from the app's private dirs. The native helper stages the binary
 * into anonymous memory and execs it from /proc/self/fd.
 */
object MemfdRunner {
  private var loadTried = false
  private var loadOk = false

  fun isAvailable(): Boolean {
    if (loadTried) return loadOk
    loadTried = true
    return try {
      System.loadLibrary("launcher")
      loadOk = true
      true
    } catch (e: Throwable) {
      Log.w("MemfdRunner", "launcher lib unavailable", e)
      loadOk = false
      false
    }
  }

  external fun available(): Boolean

  /** Blocks (fork+exec in native). Returns "exit=N\n<joined stdout/stderr>". */
  external fun execAndCapture(loaderPath: String, binaryPath: String, args: Array<String>, envEntries: Array<String>): String

  suspend fun run(loader: String, binary: String, args: List<String>, env: Map<String, String>): String =
    withContext(Dispatchers.IO) {
      val cmdArgs = args.toTypedArray()
      val envEntries = env.entries.map { "${it.key}=${it.value}" }.toTypedArray()
      execAndCapture(loader, binary, cmdArgs, envEntries)
    }
}
