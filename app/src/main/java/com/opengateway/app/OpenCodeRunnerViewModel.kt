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
    viewModelScope.launch {
      _busy.value = true
      _messages.value = _messages.value + "You: $text"
      val sb = StringBuilder()
      try {
        runner.runPrompt(text, settings.model(), settings.session()).collect { chunk ->
          sb.append(chunk)
          _messages.value = _messages.value + "AI: $chunk"
        }
      } finally { _busy.value = false }
    }
  }
}
