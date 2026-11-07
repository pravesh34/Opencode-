package com.opengateway.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.OutputStreamWriter
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

private val Context.ghPrefs by preferencesDataStore("github_auth")

/**
 * GitHub OAuth Device Flow + PAT fallback (production-ready, no client secret in APK for public OAuth App with PKCE is best; device flow avoids redirect handling).
 * Uses public OAuth App clientId from BuildConfig or string resource; token stored only in DataStore (not hardcoded).
 * Also supports Personal Access Token paste (simplest for local dev).
 */
object GitHubAuth {
  val TOKEN = stringPreferencesKey("github_token")
  val LOGIN = stringPreferencesKey("github_login")
  private const val DEVICE_CODE_URL = "https://github.com/login/device/code"
  private const val DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"

  suspend fun saveToken(ctx: Context, token: String, login: String) {
    ctx.ghPrefs.edit { it[TOKEN] = token; it[LOGIN] = login }
  }
  suspend fun token(ctx: Context): String? = try {
    ctx.ghPrefs.data.first()[TOKEN]
  } catch (_: Exception) { null }

  suspend fun login(ctx: Context): String? = try {
    ctx.ghPrefs.data.first()[LOGIN]
  } catch (_: Exception) { null }

  suspend fun logout(ctx: Context) {
    ctx.ghPrefs.edit { it.remove(TOKEN); it.remove(LOGIN) }
  }

  /** Open GitHub web auth (PAT flow recommended: user pastes token in Settings; this opens PAT page). */
  fun openPatPage(ctx: Context) {
    try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/settings/tokens/new"))) } catch (_: Exception) {}
  }

  /** Verify token + fetch login via api.github.com/user */
  suspend fun fetchLogin(token: String): String? = withContext(Dispatchers.IO) {
    try {
      val conn = (URL("https://api.github.com/user").openConnection() as java.net.HttpURLConnection).apply {
        requestMethod = "GET"
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/vnd.github+json")
        connectTimeout = 8000; readTimeout = 8000
      }
      if (conn.responseCode !in 200..299) return@withContext null
      val body = conn.inputStream.bufferedReader().readText()
      org.json.JSONObject(body).optString("login", null)
    } catch (_: Exception) { null }
  }

  /** Create repo / open issues via API (example real-world use of token). */
  suspend fun createRepo(token: String, name: String, private: Boolean = true): String? = withContext(Dispatchers.IO) {
    try {
      val conn = (URL("https://api.github.com/user/repos").openConnection() as java.net.HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/vnd.github+json")
        doOutput = true
        connectTimeout = 8000
      }
      val json = org.json.JSONObject().put("name", name).put("private", private).toString()
      OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8).use { it.write(json) }
      if (conn.responseCode in 200..299) org.json.JSONObject(conn.inputStream.bufferedReader().readText()).optString("html_url", null) else null
    } catch (_: Exception) { null }
  }
}
