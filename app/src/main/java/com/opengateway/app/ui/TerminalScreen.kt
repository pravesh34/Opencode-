package com.opengateway.app.ui

import android.content.Context
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.InputMethodManager
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.opengateway.app.AssetInstaller
import com.opengateway.app.R
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import com.termux.view.TerminalView
import com.termux.view.TerminalViewClient

@Composable
fun TerminalScreen() {
  val ctx = LocalContext.current
  AndroidView(factory = { context ->
    // Inflate from XML to avoid TerminalView(ctx) constructor requiring AttributeSet
    val tv = android.view.LayoutInflater.from(context)
      .inflate(R.layout.terminal_view, null) as TerminalView
    tv.setTextSize(13)
    val client = object : TerminalSessionClient, TerminalViewClient {
      override fun onTextChanged(changedSession: TerminalSession) { tv.onScreenUpdated() }
      override fun onTitleChanged(changedSession: TerminalSession) {}
      override fun onSessionFinished(finishedSession: TerminalSession) {}
      override fun onCopyTextToClipboard(session: TerminalSession, text: String?) {}
      override fun onPasteTextFromClipboard(session: TerminalSession?) {}
      override fun onBell(session: TerminalSession) {}
      override fun onColorsChanged(session: TerminalSession) {}
      override fun onTerminalCursorStateChange(state: Boolean) {}
      override fun getTerminalCursorStyle(): Int? = 0
      // TerminalViewClient
      override fun onScale(scale: Float): Float = scale.coerceIn(0.5f, 2.0f)
      override fun onSingleTapUp(e: MotionEvent) {
        (ctx.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
          ?.showSoftInput(tv, InputMethodManager.SHOW_IMPLICIT)
      }
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
      // Shared log methods
      override fun logError(tag: String?, message: String?) {}
      override fun logWarn(tag: String?, message: String?) {}
      override fun logInfo(tag: String?, message: String?) {}
      override fun logDebug(tag: String?, message: String?) {}
      override fun logVerbose(tag: String?, message: String?) {}
      override fun logStackTraceWithMessage(tag: String?, message: String?, e: Exception?) {}
      override fun logStackTrace(tag: String?, e: Exception?) {}
    }
    tv.setTerminalViewClient(client)
    val bin = AssetInstaller.binDir(ctx).absolutePath
    val env = arrayOf(
      "TERM=xterm-256color", "HOME=${ctx.filesDir.absolutePath}",
      "PATH=$bin:/system/bin:/system/xbin", "LANG=en_US.UTF-8"
    )
    val session = TerminalSession("/system/bin/sh", AssetInstaller.workspaceDir(ctx).absolutePath, arrayOf(), env, 2000, client)
    tv.attachSession(session)
    tv.requestFocus()
    tv
  }, modifier = Modifier.fillMaxSize())
}
