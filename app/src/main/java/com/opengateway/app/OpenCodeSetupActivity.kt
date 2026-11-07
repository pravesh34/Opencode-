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
    // One-line installer: paste this into Termux and run it. It installs Node,
    // clones this repo, installs web deps, and starts the gateway on :3000.
    private val setupCmds =
        "curl -fsSL https://raw.githubusercontent.com/pravesh34/Opencode-/main/setup-termux.sh | bash"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_opencode_setup)
        val status = findViewById<TextView>(R.id.setup_status)
        findViewById<TextView>(R.id.setup_commands).text = setupCmds

        val termuxInstalled = isAppInstalled("com.termux")
        status.text = "Termux installed: ${if (termuxInstalled) "yes — tap 'Open Termux' and paste the command" else "no — install Termux first, then tap 'Open Termux'"}\n" +
            "Native terminal (in-app): available — works offline, no setup needed\n" +
            "OpenCode: runs via the gateway you start with the installer (127.0.0.1:3000)"

        findViewById<Button>(R.id.btn_copy_cmds).setOnClickListener {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("setup", setupCmds))
            Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btn_autostart_termux).setOnClickListener { sendToTermuxRunCommand() }
        findViewById<Button>(R.id.btn_start_service).setOnClickListener {
            GatewayService.start(this)
            Toast.makeText(this, getString(R.string.service_started), Toast.LENGTH_LONG).show()
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

    /**
     * Send the installer to Termux via the RUN_COMMAND API so the user doesn't
     * have to copy-paste. Requires in Termux: Settings → "Allow external apps
     * to run commands" to be enabled. Falls back to a toast with instructions.
     */
    private fun sendToTermuxRunCommand() {
        try {
            val intent = Intent().apply {
                setClassName("com.termux", "com.termux.app.RunCommandService")
                action = "com.termux.RUN_COMMAND"
                putExtra("com.termux.RUN_COMMAND_COMMAND", setupCmds)
                putExtra("com.termux.RUN_COMMAND_CWD", "/data/data/com.termux/files/home")
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", false)
                putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", 0)
            }
            startService(intent)
            Toast.makeText(this, getString(R.string.autostart_sent), Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            try {
                val launch = packageManager.getLaunchIntentForPackage("com.termux")
                if (launch != null) startActivity(launch)
            } catch (_: Exception) {}
            Toast.makeText(this, getString(R.string.autostart_failed), Toast.LENGTH_LONG).show()
        }
    }

    private fun isAppInstalled(pkg: String): Boolean = try {
        packageManager.getPackageInfo(pkg, 0); true
    } catch (_: PackageManager.NameNotFoundException) { false }
}
