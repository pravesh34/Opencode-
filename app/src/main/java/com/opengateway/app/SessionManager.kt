package com.opengateway.app

import android.content.Context
import java.io.File

/** Simple session storage: filesDir/sessions/<id>.txt + current pointer in DataStore via SettingsRepository. */
object SessionManager {
  fun dir(ctx: Context) = File(ctx.filesDir, "sessions").apply { mkdirs() }

  fun list(ctx: Context): List<String> =
    dir(ctx).listFiles { f -> f.isFile }?.map { it.nameWithoutExtension }?.sorted() ?: emptyList()

  fun newSession(ctx: Context): String {
    val id = "s-" + System.currentTimeMillis().toString(36)
    File(dir(ctx), "$id.txt").writeText("session $id\n")
    return id
  }

  fun append(ctx: Context, id: String, text: String) {
    try { File(dir(ctx), "$id.txt").appendText(text + "\n") } catch (_: Exception) {}
  }

  fun read(ctx: Context, id: String): String =
    try { File(dir(ctx), "$id.txt").readText() } catch (_: Exception) { "" }

  fun delete(ctx: Context, id: String) {
    try { File(dir(ctx), "$id.txt").delete() } catch (_: Exception) {}
  }
}
