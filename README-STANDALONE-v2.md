# Open Gateway Standalone v2 (Jetpack Compose, no Termux)

Single APK: Native Compose UI + embedded **opencode binary** + **busybox** (Tier 1 Termux-like). No WebView, no Node gateway, no Termux install.

## Architecture
- `MainActivity` (Compose) -> `AppRoot` (Chat | Terminal | Files | Settings)
- `AssetInstaller` extracts `assets/bin/arm64-v8a/{opencode,busybox}` -> `filesDir/bin/`
- `OpenCodeRunner` runs `filesDir/bin/opencode run --format json --model <provider>/<model>` in `filesDir/workspace/`, streams text to Chat
- `TerminalScreen` = `terminal-emulator` `TerminalView` + `/system/bin/sh`, `PATH=filesDir/bin:...` so busybox applets (ls/cat/grep) work
- `SettingsRepository` (DataStore) stores provider/model/keys. Default provider = `opencode`.

## Providers (all via opencode CLI --model)
- `opencode` (default, no key tier) - just leave model blank or set opencode/<model>
- `anthropic/claude-sonnet-4-5` (+ `ANTHROPIC_API_KEY`)
- `openai/gpt-4o` (+ `OPENAI_API_KEY`)
- `openrouter/...`, `google/...`, custom via `other`
OpenCode CLI reads keys from workspace/opencode.json / env - the app writes DataStore and forwards model string; keys should be injected as env `ANTHROPIC_API_KEY` etc. in ProcessBuilder (see OpenCodeRunner - extend with env map in prod).

## Build locally (Android Studio)
1. Download pinned opencode + busybox into `app/src/main/assets/bin/arm64-v8a/` (see android.yml) OR let CI do it
2. `gradle wrapper` once, then `./gradlew assembleDebug`
3. Install on arm64 phone (emulator arm64 image also works). No Termux, no tunneling.

## APK size (~35 MB)
arm64 only (`ndk abiFilters += "arm64-v8a"`), release minify+shrink, opencode ~30 MB compressed + busybox 1 MB. 99% of phones are arm64.

## Delete from v1 (already replaced in this branch)
`web/`, `app/src/main/assets/gateway/`, `GatewayService.kt`, `GatewayRuntime.kt`, `NativeTerminalActivity.kt`, `OpenCodeSetupActivity.kt`, `setup-termux.sh`, `start-mac.sh`, old `MainActivity.kt` WebView, `network_security_config.xml`, `menu_main.xml`, old layouts.
Run `git status` to see modified files; old files remain until you `git rm` them on your side before pushing.
