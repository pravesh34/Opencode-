package com.opengateway.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class OpenCodeSetupActivity : AppCompatActivity() {
    private val setupCmds = """
# In Termux (on this Android device):
pkg update -y && pkg install -y nodejs git
# Get this project (or copy web/ folder), then:
cd ~/Opencode-/web  # adjust path
npm install
node server.js
# OpenCode (if available in your environment):
# opencode --version
# Then in this app set Gateway URL to: http://127.0.0.1:3000
""".trimIndent()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_opencode_setup)
        val status = findViewById<TextView>(R.id.setup_status)
        findViewById<TextView>(R.id.setup_commands).text = setupCmds

        val termuxInstalled = isAppInstalled("com.termux")
        status.text = "Termux installed: ${if (termuxInstalled) "yes" else "no"}\n" +
            "Native terminal (in-app): available (Termux terminal libs embedded)\n" +
            "OpenCode: configure via gateway (local 127.0.0.1:3000) or host server"

        findViewById<Button>(R.id.btn_copy_cmds).setOnClickListener {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("setup", setupCmds))
            Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btn_open_termux).setOnClickListener {
            val i = packageManager.getLaunchIntentForPackage("com.termux")
            if (i != null) startActivity(i) else {
                Toast.makeText(this, "Termux not installed", Toast.LENGTH_SHORT).show()
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/en/packages/com.termux/"))) } catch (_: Exception) {}
            }
        }
        findViewById<Button>(R.id.btn_native_terminal).setOnClickListener {
            startActivity(Intent(this, NativeTerminalActivity::class.java))
        }
        findViewById<Button>(R.id.btn_set_localhost).setOnClickListener {
            getSharedPreferences("gateway", Context.MODE_PRIVATE).edit().putString("url", "http://127.0.0.1:3000").apply()
            Toast.makeText(this, "Gateway set to http://127.0.0.1:3000 — reopen/reload app", Toast.LENGTH_LONG).show()
        }
    }

    private fun isAppInstalled(pkg: String): Boolean = try {
        packageManager.getPackageInfo(pkg, 0); true
    } catch (_: PackageManager.NameNotFoundException) { false }
}
