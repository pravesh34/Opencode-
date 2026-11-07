package com.opengateway.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.opengateway.app.ModelCatalog
import com.opengateway.app.Provider
import com.opengateway.app.SettingsRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
  val ctx = LocalContext.current
  val repo = remember { SettingsRepository(ctx) }
  val scope = rememberCoroutineScope()
  var provider by remember { mutableStateOf("opencode") }
  var model by remember { mutableStateOf("") }
  var thinking by remember { mutableStateOf("medium") }
  var key by remember { mutableStateOf("") }
  var expandedProvider by remember { mutableStateOf(false) }
  var expandedModel by remember { mutableStateOf(false) }
  var expandedThinking by remember { mutableStateOf(false) }
  val providers = Provider.entries.map { it.id }
  val models = remember(provider) { ModelCatalog.modelsFor(provider) }

  // Load saved once
  LaunchedEffect(Unit) {
    provider = repo.provider()
    model = repo.model() ?: models.firstOrNull() ?: ""
    thinking = repo.thinking()
  }

  val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { /* no-op */ }
  fun requestStorage() {
    val perms = if (Build.VERSION.SDK_INT >= 33) {
      arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO)
    } else {
      arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    permLauncher.launch(perms)
  }

  Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Provider (default: OpenCode)")
    ExposedDropdownMenuBox(expandedProvider, { expandedProvider = !expandedProvider }) {
      OutlinedTextField(provider, {}, Modifier.fillMaxWidth().menuAnchor(), label = { Text("Provider") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedProvider) })
      ExposedDropdownMenu(expandedProvider, { expandedProvider = false }) {
        providers.forEach { p -> DropdownMenuItem({ Text(p) }, { provider = p; model = ModelCatalog.modelsFor(p).firstOrNull() ?: ""; expandedProvider = false }) }
      }
    }
    Text("Model (multiple options)")
    ExposedDropdownMenuBox(expandedModel, { expandedModel = !expandedModel }) {
      OutlinedTextField(model, { model = it }, Modifier.fillMaxWidth().menuAnchor(), label = { Text("Model") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedModel) })
      ExposedDropdownMenu(expandedModel, { expandedModel = false }) {
        (models + listOf("custom (type below)")).forEach { m ->
          DropdownMenuItem({ Text(m) }, { if (m != "custom (type below)") model = m; expandedModel = false })
        }
      }
    }
    Text("Thinking level")
    ExposedDropdownMenuBox(expandedThinking, { expandedThinking = !expandedThinking }) {
      OutlinedTextField(thinking, {}, Modifier.fillMaxWidth().menuAnchor(), label = { Text("Thinking") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedThinking) })
      ExposedDropdownMenu(expandedThinking, { expandedThinking = false }) {
        ModelCatalog.thinkingLevels.forEach { t -> DropdownMenuItem({ Text(t) }, { thinking = t; expandedThinking = false }) }
      }
    }
    OutlinedTextField(key, { key = it }, Modifier.fillMaxWidth(), label = { Text("API key for $provider (blank = opencode default)") })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = {
        scope.launch {
          repo.setProvider(provider); repo.setModel(model.takeIf { it.isNotBlank() }); repo.setThinking(thinking)
          if (key.isNotBlank()) repo.saveKey(provider, key.trim())
        }
      }) { Text("Save") }
    }
    Divider()
    Text("Storage & permissions")
    Text("Workspace is app-private (filesDir/workspace). This app needs no broad storage access to run. Request media access only if you import files from Downloads/DCIM into workspace.")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { requestStorage() }) { Text("Request media access") }
      Button(onClick = {
        try { ctx.startActivity(Intent(Settings.ACTION_MANAGE_ALL_APPLICATIONS_ACCESS_PERMISSION, Uri.parse("package:${ctx.packageName}"))) } catch (_: Exception) {
          try { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))) } catch (_: Exception) {}
        }
      }) { Text("All-files settings") }
    }
    Divider()
    Text("OpenCode binary + busybox are bundled in APK (assets/bin/arm64-v8a). No Termux required.")
    Text("Thinking level + provider/model are saved and passed to opencode CLI (--model).")
  }
}
