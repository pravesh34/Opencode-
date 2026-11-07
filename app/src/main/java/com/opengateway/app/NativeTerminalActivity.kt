package com.opengateway.app

import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import com.termux.view.TerminalView
import com.termux.view.TerminalViewClient

/**
 * Native terminal embedded in APK (Termux terminal-view/emulator libs).
 * Runs a local shell inside the app sandbox. Full Termux userspace/bootstrap
 * and OpenCode on-device require additional setup (see OpenCodeSetup).
 */
class NativeTerminalActivity : AppCompatActivity(), TerminalSessionClient, TerminalViewClient {

    private lateinit var terminalView: TerminalView
    private var session: TerminalSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_terminal)
        terminalView = findViewById(R.id.terminal_view)
        terminalView.setTerminalViewClient(this)
        terminalView.setTextSize(28)
        val shell = "/system/bin/sh"
        val cwd = filesDir.absolutePath
        val env = arrayOf(
            "TERM=xterm-256color",
            "HOME=${filesDir.absolutePath}",
            "PATH=/system/bin:/system/xbin",
            "LANG=en_US.UTF-8"
        )
        session = TerminalSession(shell, cwd, arrayOf(), env, 2000, this)
        terminalView.attachSession(session)
        terminalView.requestFocus()
        terminalView.post { showKeyboard() }
    }

    private fun showKeyboard() {
        (getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.showSoftInput(terminalView, InputMethodManager.SHOW_IMPLICIT)
    }

    override fun onDestroy() {
        super.onDestroy()
        session?.finishIfRunning()
    }

    // TerminalSessionClient
    override fun onTextChanged(changedSession: TerminalSession) { terminalView.onScreenUpdated() }
    override fun onTitleChanged(changedSession: TerminalSession) { title = changedSession.title ?: "Terminal" }
    override fun onSessionFinished(finishedSession: TerminalSession) {}
    override fun onCopyTextToClipboard(session: TerminalSession, text: String?) {
        if (text.isNullOrEmpty()) return
        val cm = getSystemService(CLIPBOARD_SERVICE) as? android.content.ClipboardManager
        cm?.setPrimaryClip(android.content.ClipData.newPlainText("terminal", text))
    }
    override fun onPasteTextFromClipboard(session: TerminalSession?) {
        val cm = getSystemService(CLIPBOARD_SERVICE) as? android.content.ClipboardManager
        val text = cm?.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
        if (!text.isNullOrEmpty()) session?.write(text)
    }
    override fun onBell(session: TerminalSession) {}
    override fun onColorsChanged(session: TerminalSession) {}
    override fun onTerminalCursorStateChange(state: Boolean) {}
    override fun getTerminalCursorStyle(): Int? = 0

    // TerminalViewClient
    override fun onScale(scale: Float): Float = scale.coerceIn(0.5f, 2.0f)
    override fun onSingleTapUp(e: MotionEvent) { showKeyboard() }
    override fun shouldBackButtonBeMappedToEscape(): Boolean = false
    override fun shouldEnforceCharBasedInput(): Boolean = true
    override fun shouldUseCtrlSpaceWorkaround(): Boolean = false
    override fun isTerminalViewSelected(): Boolean = true
    override fun copyModeChanged(copyMode: Boolean) {}
    override fun onKeyDown(keyCode: Int, e: KeyEvent, session: TerminalSession): Boolean = false
    override fun onKeyUp(keyCode: Int, e: KeyEvent): Boolean = false
    override fun onLongPress(event: MotionEvent): Boolean = false
    override fun readControlKey(): Boolean = false
    override fun readAltKey(): Boolean = false
    override fun readShiftKey(): Boolean = false
    override fun readFnKey(): Boolean = false
    override fun onCodePoint(codePoint: Int, ctrlDown: Boolean, session: TerminalSession): Boolean = false
    override fun onEmulatorSet() {}

    // Shared log methods (satisfy both TerminalSessionClient & TerminalViewClient)
    override fun logError(tag: String?, message: String?) {}
    override fun logWarn(tag: String?, message: String?) {}
    override fun logInfo(tag: String?, message: String?) {}
    override fun logDebug(tag: String?, message: String?) {}
    override fun logVerbose(tag: String?, message: String?) {}
    override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
    override fun logStackTrace(tag: String?, e: Exception?) {}
}
