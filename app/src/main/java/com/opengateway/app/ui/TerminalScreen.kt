package com.opengateway.app.ui

import android.view.inputmethod.InputMethodManager
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.opengateway.app.AssetInstaller
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import com.termux.view.TerminalView
import com.termux.view.TerminalViewClient

@Composable
fun TerminalScreen() {
  val ctx = LocalContext.current
  AndroidView(factory = {
    val tv = TerminalView(ctx)
    tv.setTextSize(13)
    val client = object : TerminalSessionClient, TerminalViewClient {
      override fun onTextChanged(s: TerminalSession) = tv.onScreenUpdated()
      override fun onTitleChanged(s: TerminalSession) {}
      override fun onSessionFinished(s: TerminalSession) {}
      override fun onCopyTextToClipboard(s: TerminalSession, t: String?) {}
      override fun onPasteTextFromClipboard(s: TerminalSession?) {}
      override fun onBell(s: TerminalSession) {}
      override fun onColorsChanged(s: TerminalSession) {}
      override fun onTerminalCursorStateChange(b: Boolean) {}
      override fun getTerminalCursorStyle() = 0
      override fun logError(tag: String?, msg: String?) {}
      override fun logWarn(tag: String?, msg: String?) {}
      override fun logInfo(tag: String?, msg: String?) {}
      override fun logDebug(tag: String?, msg: String?) {}
      override fun logVerbose(tag: String?, msg: String?) {}
      override fun logStackTraceWithMessage(tag: String?, msg: String?, e: Exception?) {}
      override fun logStackTrace(tag: String?, e: Exception?) {}
      // TerminalViewClient
      override fun onScale(scale: Float) = scale.coerceIn(0.5f, 2f)
      override fun onSingleTapUp(e: android.view.MotionEvent) { (ctx.getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)?.showSoftInput(tv, InputMethodManager.SHOW_IMPLICIT) }
      override fun shouldBackButtonBeMappedToEscape() = false
      override fun shouldEnforceCharBasedInput() = true
      override fun shouldUseCtrlSpaceWorkaround() = false
      override fun isTerminalViewSelected() = true
      override fun copyModeChanged(b: Boolean) {}
      override fun onKeyDown(k: Int, e: android.view.KeyEvent, s: TerminalSession) = false
      override fun onKeyUp(k: Int, e: android.view.KeyEvent, s: TerminalSession) = false
      override fun onLongPress(e: android.view.MotionEvent) = false
      override fun readControlKey() = false
      override fun readAltKey() = false
      override fun readShiftKey() = false
      override fun readFnKey() = false
      override fun onCodePoint(c: Int, ctrl: Boolean, s: TerminalSession) = false
      override fun onEmulatorSet() {}
    }
    tv.setTerminalViewClient(client)
    val bin = AssetInstaller.binDir(ctx).absolutePath
    val env = arrayOf(
      "TERM=xterm-256color", "HOME=${ctx.filesDir.absolutePath}",
      "PATH=$bin:/system/bin:/system/xbin", "LANG=en_US.UTF-8", "PREFIX=${ctx.filesDir.absolutePath}/usr"
    )
    val session = TerminalSession("/system/bin/sh", AssetInstaller.workspaceDir(ctx).absolutePath, arrayOf(), env, 2000, client)
    tv.attachSession(session)
    tv.requestFocus()
    tv
  }, modifier = Modifier.fillMaxSize())
}
