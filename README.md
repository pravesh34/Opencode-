# Code-Go

**Projects + Terminal + AI coding (OpenCode) in your browser.**  
A fast, phone-friendly coding workspace that runs on **Mac** and **Android (Termux)** — no build step, no required APK.

> Aether Sakura UI · multi-session chat · live preview · real shell · file browser · PWA installable

## ✨ What you get

- **Projects (contact-style list)** — per-project folder, status, quick access, and an **All Projects** page.
- **Chat with OpenCode** — multi-session tabs, per-session model, deep thinking toggle, streaming output with **live progress** and a clickable **Thought process**.
- **Smart starters** — *Clone a repo*, *Brainstorm an idea* (no file edits), *Plan a feature*, *Explore (read-only)*.
- **Preview** — paste a dev-server URL or let Code-Go **auto-detect localhost URLs from Terminal output** and open them in Preview.
- **Terminal** — real host shell (Mac `zsh` / Termux `bash`), project-folder aware, history, key row, and “Send error to chat”.
- **Files** — browse and preview project files.
- **Notifications (optional)** — browser notifications for **AI finished**, **new AI replies**, and **new projects** (with permission).
- **PWA** — install to Home Screen for an app-like experience.

## 🚀 Run

### Mac
```bash
./start-mac.sh
# or: cd web && npm install && npm start
# open http://localhost:3000
```

### Android phone (Termux, fully on-device)
```bash
curl -fsSL https://raw.githubusercontent.com/pravesh34/Opencode-/main/setup-termux.sh | bash
# then open http://127.0.0.1:3000 in the phone browser (or install the PWA)
```

### Phone + Mac on the same Wi‑Fi
Run `./start-mac.sh` on the Mac and open `http://<mac-ip>:3000` on your phone.

> The web app is plain Node (`web/server.js`) + `ws` — no frontend build step.

## 📲 Install as an app (PWA)
Open Code-Go in your browser and use **Add to Home Screen** (Android / iOS). Runs in standalone mode.

## 🧩 Optional: Android APK wrapper
A Kotlin WebView wrapper is under `app/` (optional, for an app icon + in-app native terminal). Build with JDK 17 + Android SDK 35 + Gradle:

```bash
./gradlew assembleDebug   # or: gradle assembleDebug
```

## 🛠️ Dev notes
- Web UI: `web/` (`index.html`, `style.css`, `app.js`, `server.js`)
- Gateway/WebSocket handled by the Node server (see `web/server.js`)
- OpenCode CLI is used for AI coding flows when available/configured

## Branches
- `code-go` — active web-first Code-Go development
- `main` — default branch on GitHub (may lag behind active development depending on merge flow)
- `standalone-v14` — previous WebView + GatewayService version

---
Made for quick, practical coding from desktop or phone.
