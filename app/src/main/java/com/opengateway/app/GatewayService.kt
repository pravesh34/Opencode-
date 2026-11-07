package com.opengateway.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File

/**
 * Foreground service that runs the embedded gateway (assets/gateway/server.js)
 * with a Node binary, keeping it alive in the background.
 *
 * Standalone status: green when a Node runtime is available even without
 * Termux. Today that requires Termux's node (see [GatewayRuntime.findNode]).
 * If no Node is found the service posts a notification explaining the one-line
 * Termux installer and stops — it never crashes the app.
 */
class GatewayService : Service() {

    private var process: Process? = null
    private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIF_ID, buildNotification("Open Gateway starting…"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopGateway()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> startGateway()
        }
        return START_NOT_STICKY
    }

    private fun startGateway() {
        if (running) return
        try {
            if (GatewayRuntime.isGatewayRunning()) {
                updateNotification("Gateway already running ✓")
                running = true
                return
            }
            val extracted = GatewayRuntime.extractIfNeeded(this)
            val node = GatewayRuntime.findNode(this)
            val serverJs = GatewayRuntime.serverJs(this)
            if (!extracted || !serverJs.exists()) {
                updateNotification("On-device files missing — use OpenCode setup")
                stopSelfSoon()
                return
            }
            if (node == null) {
                updateNotification("Node not found — install Termux & run installer")
                stopSelfSoon()
                return
            }
            val log = GatewayRuntime.logFile(this)
            log.parentFile?.mkdirs()
            val pb = ProcessBuilder(node.absolutePath, serverJs.absolutePath)
            pb.directory(GatewayRuntime.gatewayDir(this))
            pb.environment()["PORT"] = PORT
            pb.redirectErrorStream(true)
            pb.redirectOutput(log)
            process = pb.start()
            running = true
            Log.i(TAG, "gateway started with ${node.absolutePath} (pid ${process?.pid()})")
            // poll health briefly so the notification reflects readiness
            Thread {
                repeat(10) {
                    if (GatewayRuntime.isGatewayRunning()) {
                        updateNotification("Gateway running ✓ (http://127.0.0.1:$PORT)")
                        return@Thread
                    }
                    Thread.sleep(500)
                }
                if (running) updateNotification("Gateway started — see gateway.log if UI fails")
            }.start()
        } catch (e: Exception) {
            Log.w(TAG, "gateway start failed", e)
            updateNotification("Gateway failed to start — open OpenCode setup")
            stopSelfSoon()
        }
    }

    private fun stopGateway() {
        try { process?.destroyForcibly() } catch (_: Exception) {}
        process = null
        running = false
        Log.i(TAG, "gateway stopped")
    }

    private fun stopSelfSoon() {
        Thread.sleep(800)
        try { stopSelf() } catch (_: Exception) {}
    }

    override fun onDestroy() {
        stopGateway()
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Open Gateway", NotificationManager.IMPORTANCE_LOW
            )
            ch.description = "Keeps the Open Gateway web server running in the background"
            getSystemService(Context.NOTIFICATION_SERVICE)
                .let { it as NotificationManager }.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Open Gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

    private fun updateNotification(text: String) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIF_ID, buildNotification(text))
        } catch (_: Exception) {}
    }

    companion object {
        private const val TAG = "GatewayService"
        private const val CHANNEL_ID = "gateway"
        private const val NOTIF_ID = 1001
        const val PORT = "3000"

        const val ACTION_START = "com.opengateway.app.gateway.START"
        const val ACTION_STOP = "com.opengateway.app.gateway.STOP"

        fun start(context: Context) {
            val intent = Intent(context, GatewayService::class.java).setAction(ACTION_START)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.w(TAG, "startForegroundService failed", e)
            }
        }

        fun stop(context: Context) {
            try {
                context.startService(
                    Intent(context, GatewayService::class.java).setAction(ACTION_STOP)
                )
            } catch (_: Exception) {
            }
        }

        /** True if gateway already answers on localhost (cheap check, no service query). */
        fun isRunningLocally(): Boolean = GatewayRuntime.isGatewayRunning()
    }
}
