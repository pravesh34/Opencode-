# Open Gateway — Standalone v2 (arm64, no Termux)

<img src="APP%20Logo.png" alt="Open Gateway" width="120" />

Native Jetpack Compose Android app with the **opencode CLI embedded**. One APK, no Termux, no WebView, no Node gateway. Chat with opencode (any provider/model), a real terminal, file browsing/editing, and per-project sessions — all on-device.

- **Package:** `com.opengateway.app` · **versionCode** 11 · **versionName** 2.1.0
- **ABI:** arm64-v8a only (99% of modern phones)
- **minSdk** 26 · **targetSdk** 35

## What's inside

| Piece | Details |
|---|---|
| UI | Jetpack Compose + Material 3 (Chat / Terminal / Files / Settings) |
| opencode | v1.19.5 `linux-arm64-musl` tarball from [anomalyco/opencode](https://github.com/anomalyco/opencode); `PT_INTERP` re-pointed at the app-private musl loader by CI (`patchelf`) |
| musl runtime | `ld-musl-aarch64.so.1` + `libc.musl-aarch64.so.1` (Alpine `musl-1.2.5-r4`) |
| libstdc++ / libgcc | `libstdc++.so.6.0.32`, `libgcc_s.so.1` (Alpine `13.2.1_git20240309-r1`) |
| busybox | Alpine `busybox-1.36.1-r31` ET_DYN build (musl-backed) |
| Workspace | `filesDir/workspace/` — `openCodeRunner` runs `opencode run --format json --model <provider>/<model>` |

App flow: `MainActivity` → `AppRoot` (Chat | Terminal | Files | Settings) → `AssetInstaller` extracts `assets/bin/arm64-v8a/{opencode,busybox,ld-musl-aarch64.so.1,libc.musl-aarch64.so.1,libstdc++.so.6,libgcc_s.so.1}` to `filesDir/bin/` on first launch → `OpenCodeRunner` executes `opencode` and streams JSON output into Chat.

> Why the musl + patchelf dance: the upstream opencode linux-arm64 binary is a non-PIE musl executable and Android cannot exec it as-is. CI rewrites its interpreter to `<app filesDir>/bin/ld-musl-aarch64.so.1` and ships that loader + deps inside the APK. Diagnostics are built into **Settings → Diagnostics** (Run self-test) if anything goes wrong.

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
# 1. Fetch the pinned binaries + musl runtime (same as CI — never commit them)
mkdir -p app/src/main/assets/bin/arm64-v8a
export RUN_BIN=/data/data/com.opengateway.app/files/bin
curl -fL "https://github.com/anomalyco/opencode/releases/download/v1.19.5/opencode-linux-arm64-musl.tar.gz" | tar -xz -C /tmp
for p in musl-1.2.5-r4 libstdc++-13.2.1_git20240309-r1 libgcc-13.2.1_git20240309-r1 busybox-1.36.1-r31; do
  curl -fL "https://dl-cdn.alpinelinux.org/alpine/v3.20/main/aarch64/${p}.apk" -o /tmp/$p.apk && mkdir -p /tmp/x-$p && tar -xzf /tmp/$p.apk -C /tmp/x-$p || true
done
cp /tmp/x-musl-1.2.5-r4/lib/ld-musl-aarch64.so.1 /tmp/x-musl-1.2.5-r4/lib/libc.musl-aarch64.so.1 \
   /tmp/x-libstdc++-13.2.1_git20240309-r1/usr/lib/libstdc++.so.6.0.32 /tmp/x-libgcc-13.2.1_git20240309-r1/usr/lib/libgcc_s.so.1 \
   app/src/main/assets/bin/arm64-v8a/
mv app/src/main/assets/bin/arm64-v8a/libstdc++.so.6.0.32 app/src/main/assets/bin/arm64-v8a/libstdc++.so.6
cp /tmp/x-busybox-1.36.1-r31/bin/busybox app/src/main/assets/bin/arm64-v8a/busybox
cp /tmp/opencode app/src/main/assets/bin/arm64-v8a/opencode
sudo apt-get install -y patchelf   # or `pkg install patchelf` in Termux
patchelf --set-interpreter "$RUN_BIN/ld-musl-aarch64.so.1" --set-rpath '$ORIGIN' app/src/main/assets/bin/arm64-v8a/opencode
patchelf --set-interpreter "$RUN_BIN/ld-musl-aarch64.so.1" --set-rpath '$ORIGIN' app/src/main/assets/bin/arm64-v8a/busybox
chmod 755 app/src/main/assets/bin/arm64-v8a/*

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

## Troubleshooting

**Chat does nothing / [error] failed to start opencode** — the app can't exec the embedded binary.

1. **Settings → Diagnostics → Run self-test** — shows binary paths, sizes, `--version` output and exit code. No PC/adb needed.
2. **Settings → Diagnostics → Reinstall binaries** — wipes and re-extracts everything (use after an update).
3. Still broken → capture logs with adb (see below) and look for `OpenCodeRunner` / `AssetInstaller` tags.

**adb over Wi‑Fi (Android 11+, works from Termux on the same phone):**

```bash
pkg install android-tools
# Developer options -> Wireless debugging -> ON -> Pair device with pairing code
adb pair <ip>:<port> <6-digit-code>
adb connect <ip>:<port>
adb logcat -s OpenCodeRunner:V AssetInstaller:V
```

**Updating:** the embedded runtime is versioned (`AssetInstaller.TARGET_VERSION`). When it changes, the app re-extracts the binaries automatically on next launch.

## CI notes

- Workflow: `.github/workflows/android.yml` — runs on all branch pushes, tags `v*`, and manual dispatch
- Binaries are pinned (opencode + Alpine packages by exact version) and gitignored; CI fetches them fresh each run
- CI patches the embedded binaries' interpreter/RPATH with `patchelf` (targets the app's filesDir, not the runner)
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
