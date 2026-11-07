package com.opengateway.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
  var selected by remember { mutableStateOf<File?>(null) }
  var editorText by remember { mutableStateOf("") }
  var snackbar by remember { mutableStateOf<String?>(null) }
  fun refresh() { snackbar = (snackbar ?: "") + " " } // trigger recomposition hack
  val entries = remember(dir, snackbar) { dir.listFiles()?.sortedWith(compareBy({ !it.isDirectory }, { it.name })) ?: emptyList() }

  val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
    uri?.let {
      try {
        val name = "imported_${System.currentTimeMillis()}.txt"
        val out = File(dir, name)
        ctx.contentResolver.openInputStream(it)?.use { ins -> out.outputStream().use { o -> ins.copyTo(o) } }
        snackbar = "Imported $name"
      } catch (e: Exception) { snackbar = "Import failed: ${e.message}" }
    }
  }

  Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(dir.absolutePath)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      if (dir.parentFile != null) Text("..", Modifier.clickable { dir.parentFile?.let { dir = it } })
      Button(onClick = { importLauncher.launch(arrayOf("*/*")) }) { Text("Import") }
    }
    snackbar?.let { Text(it) }
    LazyColumn {
      items(entries) { f ->
        Text((if (f.isDirectory) "📁 " else "📄 ") + f.name, Modifier.clickable { if (f.isDirectory) dir = f else { selected = f; editorText = try { if (f.length() < 200_000) f.readText() else f.readText().take(200_000) } catch (_: Exception) { "" } } })
      }
    }
  }
  selected?.let { f ->
    AlertDialog(
      onDismissRequest = { selected = null },
      title = { Text(f.name) },
      text = {
        Column {
          OutlinedTextField(editorText, { editorText = it }, Modifier.fillMaxWidth(), label = { Text("Content") })
        }
      },
      confirmButton = {
        Row {
          TextButton(onClick = {
            try { f.writeText(editorText); snackbar = "Saved ${f.name}" } catch (e: Exception) { snackbar = "Save failed: ${e.message}" }
            selected = null
          }) { Text("Save") }
          TextButton(onClick = { selected = null }) { Text("Close") }
        }
      },
      dismissButton = {
        TextButton(onClick = {
          try { f.delete(); snackbar = "Deleted ${f.name}" } catch (_: Exception) {}
          selected = null
        }) { Text("Delete") }
      }
    )
  }
}
