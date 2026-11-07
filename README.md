# Open Gateway — Standalone v2 (arm64, no Termux)

<img src="APP%20Logo.png" alt="Open Gateway" width="120" />

Native Jetpack Compose Android app with the **opencode CLI embedded**. One APK, no Termux, no WebView, no Node gateway. Chat with opencode (any provider/model), a real terminal, file browsing/editing, and per-project sessions — all on-device.

- **Package:** `com.opengateway.app` · **versionCode** 10 · **versionName** 2.0.0
- **ABI:** arm64-v8a only (99% of modern phones)
- **minSdk** 26 · **targetSdk** 35

## What's inside

| Piece | Details |
|---|---|
| UI | Jetpack Compose + Material 3 (Chat / Terminal / Files / Settings) |
| opencode | v1.19.5 `linux-arm64-musl` tarball from [anomalyco/opencode](https://github.com/anomalyco/opencode) releases, fetched in CI, never committed |
| busybox | Alpine `busybox-static-1.36.1-r31` (aarch64), extracted from the official `.apk` |
| Workspace | `filesDir/workspace/` — `openCodeRunner` runs `opencode run --format json --model <provider>/<model>` |

App flow: `MainActivity` → `AppRoot` (Chat | Terminal | Files | Settings) → `AssetInstaller` extracts `assets/bin/arm64-v8a/{opencode,busybox}` to `filesDir/bin/` on first launch → `OpenCodeRunner` executes it and streams JSON output into Chat.

See [README-STANDALONE-v2.md](README-STANDALONE-v2.md) for architecture notes, provider list, and design history.

## Download / install

Every push to any branch triggers **Android APK (Standalone v2 - arm64 only)** in GitHub Actions.

Artifacts (Actions tab → latest run → **Artifacts**):

- `app-debug-apk` — debug-signed APK, install directly on an arm64 phone (retention 30 days)
- `app-release-aab` — release AAB for Play Console (retention 90 days)

Or with the GitHub CLI:

```bash
gh run download <run-id> -n app-debug-apk
```

Pushing a `v*` tag also attaches both files to a GitHub Release.

## Build locally (Android Studio, arm64 or x86_64 host)

```bash
# 1. Fetch the pinned binaries (same as CI — never commit them)
mkdir -p app/src/main/assets/bin/arm64-v8a
curl -fL "https://github.com/anomalyco/opencode/releases/download/v1.19.5/opencode-linux-arm64-musl.tar.gz" | tar -xz -C app/src/main/assets/bin/arm64-v8a/ opencode
curl -fL "https://dl-cdn.alpinelinux.org/alpine/v3.20/main/aarch64/busybox-static-1.36.1-r31.apk" -o /tmp/bb.apk
tar -xzf /tmp/bb.apk -C /tmp bin/busybox.static && cp /tmp/bin/busybox.static app/src/main/assets/bin/arm64-v8a/busybox
chmod +x app/src/main/assets/bin/arm64-v8a/{opencode,busybox}

# 2. Build
gradle wrapper   # once, if gradlew is missing
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Requires JDK 17. Release config uses R8 + resource shrinking.

## Providers & keys

All models are invoked through the embedded `opencode` CLI (`opencode run --model <provider>/<model>`):

- `opencode/…` — free tier, no key needed
- `anthropic/claude-sonnet-4-5` — needs `ANTHROPIC_API_KEY`
- `openai/gpt-4o` — needs `OPENAI_API_KEY`
- `openrouter/…`, `google/…`, or `other/<model>`

Keys are stored in DataStore (Settings screen) and forwarded to the opencode process. GitHub auth (Settings) supports PAT paste for private model access.

## CI notes

- Workflow: `.github/workflows/android.yml` — runs on all branch pushes, tags `v*`, and manual dispatch
- Binaries are pinned (version + Alpine release) and gitignored; CI fetches them fresh each run
- Known cosmetic warnings: Node.js 20 action deprecation, `setup-java@v4` → v5, `ubuntu-latest` migration

## Repo layout

```
app/                        # Compose app module (arm64 only)
  src/main/java/com/opengateway/app/
    MainActivity.kt         # Compose entry
    AssetInstaller.kt       # extracts bundled opencode/busybox on first run
    OpenCodeRunner.kt       # runs opencode CLI, streams JSON to Chat
    ui/                     # ChatScreen, TerminalScreen, FilesScreen, SettingsScreen
  src/main/AndroidManifest.xml
.github/workflows/android.yml
README-STANDALONE-v2.md     # design doc / provider notes
```
