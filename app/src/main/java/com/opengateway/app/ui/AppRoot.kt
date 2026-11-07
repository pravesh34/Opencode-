package com.opengateway.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import com.opengateway.app.OpenCodeRunner
import com.opengateway.app.OpenCodeRunnerViewModel

@Composable
fun AppRoot(padding: androidx.compose.foundation.layout.PaddingValues) {
  val ctx = LocalContext.current
  val runner = remember { OpenCodeRunner(ctx) }
  val tabs = listOf("Chat" to Icons.Default.Edit, "Terminal" to Icons.Default.Terminal, "Files" to Icons.Default.Folder, "Settings" to Icons.Default.Settings)
  var sel by remember { mutableStateOf(0) }
  Scaffold(
    bottomBar = {
      NavigationBar {
        tabs.forEachIndexed { i, (label, icon) ->
          NavigationBarItem(selected = sel == i, onClick = { sel = i }, icon = { Icon(icon, label) }, label = { Text(label) })
        }
      }
    }
  ) { inner ->
    androidx.compose.foundation.layout.Box(Modifier.padding(inner)) {
      when (sel) {
        0 -> ChatScreen(runner)
        1 -> TerminalScreen()
        2 -> FilesScreen()
        3 -> SettingsScreen()
      }
    }
  }
}
