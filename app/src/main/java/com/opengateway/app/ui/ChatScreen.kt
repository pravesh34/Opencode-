package com.opengateway.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.opengateway.app.OpenCodeRunner
import com.opengateway.app.OpenCodeRunnerViewModel
import com.opengateway.app.SettingsRepository

@Composable
fun ChatScreen(runner: OpenCodeRunner) {
  val ctx = LocalContext.current
  val vm = remember { OpenCodeRunnerViewModel(runner, SettingsRepository(ctx)) }
  val msgs by vm.messages.collectAsState()
  val busy by vm.busy.collectAsState()
  var input by remember { mutableStateOf("") }
  Column(Modifier.fillMaxSize().padding(12.dp)) {
    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      items(msgs) { Text(it) }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      TextField(input, { input = it }, Modifier.weight(1f), placeholder = { Text("Message opencode…") })
      Button(onClick = { if (input.isNotBlank() && !busy) { vm.send(input.trim()); input = "" } }, enabled = !busy) { Text(if (busy) "…" else "Send") }
    }
  }
}
