package com.opengateway.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class OpenCodeRunnerViewModel(private val runner: OpenCodeRunner, private val settings: SettingsRepository) : ViewModel() {
  private val _messages = MutableStateFlow<List<String>>(emptyList())
  val messages: StateFlow<List<String>> = _messages
  private val _busy = MutableStateFlow(false)
  val busy: StateFlow<Boolean> = _busy

  fun send(text: String) {
    val msg = text.trim()
    if (msg.isBlank()) return
    viewModelScope.launch {
      _busy.value = true
      _messages.value = _messages.value + "You: $msg"
      try {
        var saw = false
        runner.runPrompt(msg, settings.model(), settings.session()).collect { chunk ->
          saw = true
          _messages.value = _messages.value + "AI: $chunk"
        }
        if (!saw) _messages.value = _messages.value + "AI: [no output - binary may still be extracting, try again]"
      } catch (e: Exception) {
        _messages.value = _messages.value + "AI: [error] ${e.message}"
      } finally {
        _busy.value = false
      }
    }
  }
}
