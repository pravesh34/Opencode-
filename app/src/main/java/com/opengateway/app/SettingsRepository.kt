package com.opengateway.app

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.prefs by preferencesDataStore("settings")

class SettingsRepository(private val ctx: Context) {
  companion object {
    val PROVIDER = stringPreferencesKey("provider")       // "opencode" default
    val ANTHROPIC_KEY = stringPreferencesKey("anthropic_key")
    val OPENAI_KEY = stringPreferencesKey("openai_key")
    val OPENROUTER_KEY = stringPreferencesKey("openrouter_key")
    val GOOGLE_KEY = stringPreferencesKey("google_key")
    val MODEL = stringPreferencesKey("model")
    val SESSION = stringPreferencesKey("session_id")
    val THINKING = stringPreferencesKey("thinking_level") // low/medium/high/max
  }
  suspend fun provider(): String = ctx.prefs.data.map { it[PROVIDER] ?: "opencode" }.first()
  suspend fun setProvider(v: String) = ctx.prefs.edit { it[PROVIDER] = v }
  suspend fun model(): String? = ctx.prefs.data.map { it[MODEL] }.first()
  suspend fun setModel(v: String?) = ctx.prefs.edit { if (v == null) it.remove(MODEL) else it[MODEL] = v }
  suspend fun thinking(): String = ctx.prefs.data.map { it[THINKING] ?: "medium" }.first()
  suspend fun setThinking(v: String) = ctx.prefs.edit { it[THINKING] = v }
  suspend fun saveKey(provider: String, key: String) = ctx.prefs.edit {
    when (provider) {
      "anthropic" -> it[ANTHROPIC_KEY] = key
      "openai" -> it[OPENAI_KEY] = key
      "openrouter" -> it[OPENROUTER_KEY] = key
      "google" -> it[GOOGLE_KEY] = key
    }
  }
  suspend fun session(): String? = ctx.prefs.data.map { it[SESSION] }.first()
  suspend fun setSession(v: String) = ctx.prefs.edit { it[SESSION] = v }
}
