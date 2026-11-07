package com.opengateway.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.opengateway.app.AssetInstaller
import java.io.File

@Composable
fun FilesScreen() {
  val ctx = LocalContext.current
  var dir by remember { mutableStateOf(AssetInstaller.workspaceDir(ctx)) }
  val entries = remember(dir) { dir.listFiles()?.sortedWith(compareBy({ !it.isDirectory }, { it.name })) ?: emptyList() }
  var selected by remember { mutableStateOf<File?>(null) }
  var content by remember { mutableStateOf("") }
  Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(dir.absolutePath)
    if (dir.parentFile != null) Text("..", Modifier.clickable { dir.parentFile?.let { dir = it } })
    if (selected == null) {
      LazyColumn {
        items(entries) { f ->
          Text((if (f.isDirectory) "📁 " else "📄 ") + f.name, Modifier.clickable {
            if (f.isDirectory) dir = f
            else {
              selected = f
              content = try { if (f.length() > 200_000) f.readText().take(200_000) else f.readText() } catch (_: Exception) { "[binary/unreadable]" }
            }
          })
        }
      }
    } else {
      Text(selected?.name ?: "")
      OutlinedTextField(content, { content = it }, Modifier.weight(1f).fillMaxWidth())
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = {
          try { selected?.writeText(content) } catch (_: Exception) {}
          selected = null
        }) { Text("Save") }
        Button(onClick = { selected = null }) { Text("Back") }
      }
    }
  }
}
