# Open Gateway (Kotlin Android)

A Kotlin Android app (WebView) that loads the Open Gateway web UI (Next.js PWA) so you can install it as an APK.

## Local web app (for testing)

The repo now ships a local web app in `web/` that the wrapper loads:

```bash
cd web
npm install
npm start
# http://localhost:3000  ·  WS ws://localhost:8080/ws (also localhost:3000/ws)
```

It includes Home, Chat, Terminal and Settings tabs and is the default target for emulator runs (`http://10.0.2.2:3000` = host `localhost`). See `web/README.md`.

## Configure URL

Edit `gradle.properties` (build-time default):

```properties
GATEWAY_URL=http://10.0.2.2:3000
```

Or change it at runtime in the app: **Menu → Settings → Gateway URL** (persisted in `SharedPreferences`, survives rebuilds). For local dev you can use `http://<device-ip>:3000` (cleartext enabled).

## Build APK (needs Android SDK + JDK 17)

On a machine with Android Studio/SDK:

```bash
# from this folder
gradle wrapper   # if you want ./gradlew
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Release builds use R8 + resource shrinking (`isMinifyEnabled = true`, `app/proguard-rules.pro`).

## Build APK via GitHub Actions

1. Push to GitHub.
2. Open the **Actions** tab → run **Android APK** (or push a commit). You can pass a `gateway_url` override via **Run workflow** inputs.
3. Download the `app-debug-apk` artifact.

## What's improved (v1.1.0)

- **Toolbar & menu** (Reload, Home, Back, Forward, Share, Copy link, Open in browser, Settings)
- **URL settings** — in-app editor, persisted, with clear-cache action
- **Error & offline UX** — dedicated error view with Retry/Settings, offline banner + auto-retry, `onReceivedHttpError` and SSL-error dialog (proceed/cancel/view cert)
- **WebView features** — file upload (content + camera), `DownloadManager` downloads, long-press link menu (open/share/copy), safe browsing, zoom enabled, FileProvider
- **Pull-to-refresh + loading bar** — themed spinner, thin accent progress bar, `onPause/onResume` lifecycle, state save/restore, deep-link & Send-intent handling
- **Build** — version 1.1.0 (code 2), release minify, `lifecycle-runtime-ktx`, CI caching & gateway override

## Tunneling (for the web gateway)

The web gateway must be reachable by the phone. If using the Next.js app on another device:

```bash
# terminal running open-gateway web + gateway
npx cloudflared tunnel --url http://localhost:3000
```

Use the printed `https://....trycloudflare.com` as `GATEWAY_URL`. **Note:** the chat/terminal WebSocket (`:8080`) also needs to be reachable; for full functionality, proxy WS through the same origin/tunnel (the included `web/` server does this) or tunnel `:8080` separately and configure the web app's `NEXT_PUBLIC_GATEWAY_WS` accordingly.

## Termux prerequisites (if building/pushing from Termux)

```bash
pkg update
pkg install git openjdk-17
# Android SDK/Gradle setup is required separately to build APK locally.
```
