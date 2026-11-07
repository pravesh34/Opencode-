package com.opengateway.app

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Option 1 (standalone) scaffolding: the web gateway files ship inside the APK
 * (assets/gateway/) and are extracted to private storage on first launch.
 *
 * What this does NOT do yet (see docs/STANDALONE.md):
 *  - bundle a Node.js runtime (needed to execute server.js on-device without Termux)
 *  - bundle the OpenCode CLI binary per ABI
 * Until those land, [findNode] will only succeed if Node is already available
 * (from Termux, or a future bundled runtime), and the app falls back to the
 * existing Termux installer flow in [OpenCodeSetupActivity].
 */
object GatewayRuntime {

    private const val TAG = "GatewayRuntime"
    private const val ASSET_ROOT = "gateway"
    private const val VERSION_FILE = ".asset_version"

    fun gatewayDir(context: Context): File = File(context.filesDir, "gateway")

    fun serverJs(context: Context): File = File(gatewayDir(context), "server.js")

    /**
     * Copy the gateway files from assets into filesDir/gateway (re-extracts
     * on version bump). Returns true if server.js is present afterwards.
     */
    fun extractIfNeeded(context: Context): Boolean {
        val dir = gatewayDir(context)
        val verFile = File(dir, VERSION_FILE)
        val current = BuildConfig.VERSION_CODE.toString()
        if (serverJs(context).exists() && verFile.exists() && verFile.readText().trim() == current) {
            return true
        }
        return try {
            dir.mkdirs()
            copyAssetTree(context, ASSET_ROOT, dir)
            verFile.writeText(current)
            serverJs(context).exists()
        } catch (e: Exception) {
            Log.w(TAG, "asset extraction failed", e)
            serverJs(context).exists()
        }
    }

    private fun copyAssetTree(context: Context, assetPath: String, outDir: File) {
        val entries = context.assets.list(assetPath) ?: return
        for (name in entries) {
            val childAsset = "$assetPath/$name"
            val outFile = File(outDir, name)
            val isDir = try {
                context.assets.open(childAsset).close()
                false
            } catch (e: Exception) {
                true
            }
            if (isDir) {
                outFile.mkdirs()
                copyAssetTree(context, childAsset, outFile)
            } else {
                context.assets.open(childAsset).use { input ->
                    FileOutputStream(outFile).use { output -> input.copyTo(output) }
                }
            }
        }
    }

    /** Candidate Node binaries: future bundled runtime first, then Termux. */
    fun findNode(context: Context): File? {
        val candidates = listOfNotNull(
            // future: bundled in filesDir/node/bin/node (see docs/STANDALONE.md)
            File(context.filesDir, "node/bin/node"),
            File(context.filesDir, "node/node"),
            // Termux install (works when Termux is installed on the device)
            File("/data/data/com.termux/files/usr/bin/node").takeIf { it.exists() },
            File("/data/data/com.termux/files/usr/bin/nodejs").takeIf { it.exists() },
        )
        return candidates.firstOrNull { it.exists() && it.canExecute() }
    }

    /** Quick TCP/HTTP check that a gateway is already serving on localhost:3000. */
    fun isGatewayRunning(timeoutMs: Int = 1500): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL("http://127.0.0.1:3000/api/health").openConnection() as HttpURLConnection
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.requestMethod = "GET"
            conn.responseCode in 200..299
        } catch (e: Exception) {
            false
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    fun logFile(context: Context): File = File(context.filesDir, "gateway.log")
}
