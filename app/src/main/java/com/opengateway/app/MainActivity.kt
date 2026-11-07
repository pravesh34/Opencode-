package com.opengateway.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.opengateway.app.ui.AppRoot
import com.opengateway.app.ui.theme.OpenGatewayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Extract opencode + busybox on first launch (no Termux needed)
        AssetInstaller.installIfNeeded(this)
        setContent {
            OpenGatewayTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { inner ->
                    AppRoot(padding = inner)
                }
            }
        }
    }
}
