# Open Gateway (Kotlin Android)

A simple Kotlin Android app (WebView) that loads the Open Gateway web UI (Next.js PWA) so you can install it as an APK.

## Configure URL
Edit `gradle.properties`:
```properties
GATEWAY_URL=https://YOUR-TUNNEL-URL
```
For local dev you can use `http://<device-ip>:3000` (cleartext enabled).

## Build APK (needs Android SDK + JDK 17)
On a machine with Android Studio/SDK:
```bash
# from this folder
gradle wrapper   # if you want ./gradlew
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Build APK via GitHub Actions
1. Create a GitHub repo and push this project.
2. Open the **Actions** tab → run **Android APK** (or push a commit).
3. Download the `app-debug-apk` artifact.

## GitHub repo (commands)
```bash
cd open-gateway-kotlin
git init
git add .
git commit -m "Open Gateway Kotlin app"
# create repo on GitHub, then:
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```
(Requires `git` and GitHub auth/token/SSH.)

## Tunneling (for the web gateway)
The web gateway must be reachable by the phone. If using the Next.js app on another device:
```bash
# terminal running open-gateway web + gateway
npx cloudflared tunnel --url http://localhost:3000
```
Use the printed `https://....trycloudflare.com` as `GATEWAY_URL`. **Note:** the chat/terminal WebSocket (`:8080`) also needs to be reachable; for full functionality, proxy WS through the same origin/tunnel or tunnel `:8080` separately and configure the web app’s `NEXT_PUBLIC_GATEWAY_WS` accordingly.

## Termux prerequisites (if building/pushing from Termux)
```bash
pkg update
pkg install git openjdk-17
# Android SDK/Gradle setup is required separately to build APK locally.
```
