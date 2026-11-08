package com.opengateway.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.opengateway.app.ui.AppRoot
import com.opengateway.app.ui.theme.OpenGatewayTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Extract + probe exec slot on background thread (no Termux needed)
        lifecycleScope.launch(Dispatchers.IO) { AssetInstaller.installIfNeeded(this@MainActivity) }
        setContent {
            OpenGatewayTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { inner ->
                    AppRoot(padding = inner)
                }
            }
        }
    }
}
