# Code-Go

Projects + terminal + AI coding (**OpenCode**) in your browser. Works on **Mac** and on an **Android phone** — no build, no APK required.

## Run (one line each side)

**Mac:**
```bash
./start-mac.sh            # or: cd web && npm install && npm start
# open http://localhost:3000
```

**Android phone (Termux, fully on-device):**
```bash
curl -fsSL https://raw.githubusercontent.com/pravesh34/Opencode-/main/setup-termux.sh | bash
# then open http://127.0.0.1:3000 in the phone browser (or install the PWA)
```

**Phone + Mac on one WiFi:** run `./start-mac.sh` on the Mac and open `http://<mac-ip>:3000` in the phone browser.

> This repo's web server is plain Node (`web/server.js`) + `ws`. No build step.

## PWA (saves as an app icon)

`web/manifest.webmanifest` + `web/sw.js` make Code-Go installable: browser menu → **“Add to Home Screen”** (Android) / Share → **“Add to Home Screen”** (iOS). Display is `standalone` with theme `#19C37D`.

## What you get

- **Projects** (Telegram-style list): per-project folder, git branch, last prompt, Running/Stopped status
- **Chat** with OpenCode: multi-session tabs, per-session model, Accept/Undo, quick-action chips
- **Preview**: live dev-server WebView inside the app
- **Terminal**: real host shell (Mac zsh / Termux bash), key row, history, “Send error to chat”
- **Files**: browse + preview project files

## Optional: Android APK wrapper

A Kotlin WebView wrapper (renamed **Code-Go**) is under `app/` — purely optional for an app icon + in-app native terminal. Build with JDK 17 + Android SDK 35 + Gradle:
```bash
./gradlew assembleDebug   # (or: gradle assembleDebug)
```
First launch defaults to `http://127.0.0.1:3000` and auto-starts the gateway service — no manual URL setup.

## Branches

- `main` — standalone Compose app (embedded opencode/busybox)
- `standalone-v14` — previous WebView + GatewayService version
- `code-go` — this branch (WebApp-first)
