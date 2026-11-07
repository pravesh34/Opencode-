package com.opengateway.app.ui

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
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
  var key by remember { mutableStateOf("") }
  var expanded by remember { mutableStateOf(false) }
  val providers = Provider.entries.map { it.id }
  Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Provider (default: OpenCode)")
    ExposedDropdownMenuBox(expanded, { expanded = !expanded }) {
      OutlinedTextField(provider, {}, Modifier.fillMaxWidth().menuAnchor(), label = { Text("Provider") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) })
      ExposedDropdownMenu(expanded, { expanded = false }) {
        providers.forEach { p -> DropdownMenuItem({ Text(p) }, { provider = p; expanded = false }) }
      }
    }
    OutlinedTextField(model, { model = it }, Modifier.fillMaxWidth(), label = { Text("Model (e.g. anthropic/claude-sonnet-4-5, openai/gpt-4o)") })
    OutlinedTextField(key, { key = it }, Modifier.fillMaxWidth(), label = { Text("API key for $provider (blank = use opencode default)") })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = { scope.launch { repo.setProvider(provider); repo.setModel(model.takeIf { it.isNotBlank() }); if (key.isNotBlank()) repo.saveKey(provider, key.trim()) } }) { Text("Save") }
    }
    Divider()
    Text("OpenCode binary + busybox are bundled in APK (assets/bin/arm64-v8a). No Termux required. Workspace: app-private filesDir/workspace.")
    Text("Model strings passed as --model <provider>/<model> to opencode CLI.")
  }
}
