package com.opengateway.app

import android.content.Context
import java.io.File
import org.json.JSONObject

/** Writes workspace/opencode.json so embedded opencode CLI picks up provider/model/permission without extra flags. */
object ProviderConfig {
  private fun file(ctx: Context) = File(AssetInstaller.workspaceDir(ctx), "opencode.json")

  fun write(ctx: Context, provider: String, model: String?, permission: String, thinking: String) {
    try {
      val root = JSONObject()
      if (!model.isNullOrBlank()) root.put("model", model)
      // opencode permission: ask (plan) | allow (build)
      val perm = JSONObject()
      perm.put("edit", if (permission == "plan") "ask" else "allow")
      perm.put("bash", if (permission == "plan") "ask" else "allow")
      root.put("permission", perm)
      // thinking level as variant hint (opencode supports variant per model; stored for future)
      root.put("thinking", thinking)
      file(ctx).writeText(root.toString(2))
    } catch (_: Exception) {}
  }
}
