package com.opengateway.app.ui

import android.Manifest
import android.content.Intent
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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.foundation.text.selection.SelectionContainer
import com.opengateway.app.AssetInstaller
import com.opengateway.app.ModelCatalog
import com.opengateway.app.ModelFetcher
import com.opengateway.app.OpenCodeRunner
import com.opengateway.app.Provider
import com.opengateway.app.ProviderConfig
import com.opengateway.app.SettingsRepository
import com.opengateway.app.GitHubAuth
import kotlinx.coroutines.Dispatchers
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
  var mode by remember { mutableStateOf("plan") } // plan | build
  var key by remember { mutableStateOf("") }
  var fetching by remember { mutableStateOf(false) }
  var expandedProvider by remember { mutableStateOf(false) }
  var expandedModel by remember { mutableStateOf(false) }
  var expandedThinking by remember { mutableStateOf(false) }
  val providers = Provider.entries.map { it.id }
  var dynamicModels by remember { mutableStateOf<List<String>>(emptyList()) }
  val models = dynamicModels.ifEmpty { ModelCatalog.modelsFor(provider) }

  LaunchedEffect(Unit) {
    try {
      provider = repo.provider()
      model = repo.model() ?: models.firstOrNull() ?: ""
      thinking = repo.thinking()
      mode = repo.permission()
    } catch (_: Exception) {}
  }

  val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
  fun requestStorage() {
    val perms = if (Build.VERSION.SDK_INT >= 33) {
      arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO)
    } else {
      arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    permLauncher.launch(perms)
  }

  Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Multi-AI Setup (default: OpenCode)")
    ExposedDropdownMenuBox(expandedProvider, { expandedProvider = !expandedProvider }) {
      OutlinedTextField(provider, {}, Modifier.fillMaxWidth().menuAnchor(), label = { Text("Provider") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expandedProvider) })
      ExposedDropdownMenu(expandedProvider, { expandedProvider = false }) {
        providers.forEach { p ->
          DropdownMenuItem({ Text(p) }, {
            provider = p
            dynamicModels = emptyList()
            model = ModelCatalog.modelsFor(p).firstOrNull() ?: ""
            expandedProvider = false
          })
        }
      }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = {
        fetching = true
        scope.launch {
          dynamicModels = try { ModelFetcher.fetchModels(ctx, provider) } catch (_: Exception) { ModelCatalog.modelsFor(provider) }
          fetching = false
        }
      }) { Text(if (fetching) "Fetching…" else "Fetch models") }
    }
    Text("Model")
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
    Text("Mode: Plan (ask before edit/bash) | Build (auto-allow)")
    SingleChoiceSegmentedButtonRow {
      listOf("plan", "build").forEachIndexed { i, option ->
        val selected = mode == option
        SegmentedButton(
          selected = selected,
          onClick = { mode = option },
          shape = SegmentedButtonDefaults.itemShape(index = i, count = 2)
        ) { Text(option) }
      }
    }
    OutlinedTextField(key, { key = it }, Modifier.fillMaxWidth(), label = { Text("API key for $provider (blank = opencode default)") })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = {
        scope.launch {
          repo.setProvider(provider)
          repo.setModel(model.takeIf { it.isNotBlank() })
          repo.setThinking(thinking)
          repo.setPermission(mode)
          if (key.isNotBlank()) repo.saveKey(provider, key.trim())
          ProviderConfig.write(ctx, provider, model.takeIf { it.isNotBlank() }, mode, thinking)
        }
      }) { Text("Save & write opencode.json") }
    }
    Divider()
    Text("GitHub sign-in (PAT)")
    var ghToken by remember { mutableStateOf("") }
    var ghLogin by remember { mutableStateOf("") }
    var ghBusy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { try { ghToken = GitHubAuth.token(ctx) ?: ""; ghLogin = GitHubAuth.login(ctx) ?: "" } catch (_: Exception) {} }
    OutlinedTextField(ghToken, { ghToken = it }, Modifier.fillMaxWidth(), label = { Text(if (ghLogin.isNotBlank()) "GitHub @${ghLogin} (paste new PAT to swap)" else "GitHub PAT (ghp_… / github_pat_…)") })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { GitHubAuth.openPatPage(ctx) }) { Text("Create PAT") }
      Button(onClick = {
        ghBusy = true
        scope.launch {
          val tok = ghToken.trim()
          if (tok.isNotBlank()) {
            val login = GitHubAuth.fetchLogin(tok)
            if (login != null) { GitHubAuth.saveToken(ctx, tok, login); ghLogin = login } else { ghLogin = "invalid token" }
          }
          ghBusy = false
        }
      }, enabled = !ghBusy) { Text(if (ghBusy) "Verifying…" else "Verify & save") }
      Button(onClick = { scope.launch { GitHubAuth.logout(ctx); ghToken = ""; ghLogin = "" } }) { Text("Sign out") }
    }
    Divider()
    Text("Storage & permissions")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { requestStorage() }) { Text("Request media access") }
      Button(onClick = {
        try { ctx.startActivity(Intent("android.settings.MANAGE_ALL_APPLICATIONS_ACCESS_PERMISSION", Uri.parse("package:${ctx.packageName}"))) } catch (_: Exception) {
          try { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))) } catch (_: Exception) {}
        }
      }) { Text("All-files settings") }
    }
    Divider()
    Text("Diagnostics")
    var diagBusy by remember { mutableStateOf(false) }
    var diagResult by remember { mutableStateOf("") }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = {
        diagBusy = true
        scope.launch(Dispatchers.IO) { diagResult = OpenCodeRunner(ctx).selfTest(); diagBusy = false }
      }, enabled = !diagBusy) { Text(if (diagBusy) "Testing…" else "Run self-test") }
      Button(onClick = {
        diagBusy = true
        scope.launch(Dispatchers.IO) { diagResult = AssetInstaller.forceReinstall(ctx); diagBusy = false }
      }, enabled = !diagBusy) { Text("Reinstall binaries") }
    }
    if (diagResult.isNotBlank()) SelectionContainer { Text(diagResult) }
    Divider()
    Text("OpenCode binary + busybox bundled (assets/bin/arm64-v8a). No Termux required. Provider/model/permission written to workspace/opencode.json and passed as --model at runtime. Git via busybox applet (ls/git/log/status).")
  }
}
