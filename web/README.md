# Code-Go web (local demo)

The web UI that the Android WebView app loads. Run it locally on `:3000` for development, or point the app at a tunnel / production Next.js PWA via the in-app Settings.

## Run

```bash
cd web
npm install
npm start
# open http://localhost:3000
```

- Web: http://localhost:3000
- WS: ws://localhost:8080/ws (also ws://localhost:3000/ws for single-origin tunnelling)
- Health: http://localhost:3000/api/health

The server is plain Node (`server.js`) + `ws`. No build step — edit `index.html` / `app.js` / `style.css` and hot-reload by refreshing.

## PWA

`manifest.webmanifest` + `sw.js` make it installable ("Add to Home Screen"). On `localhost` the service worker is only registered over HTTPS in production browsers, but the install prompt still works from the manifest.

## Point the app at it

- **Emulator**: tap Settings → `Gateway URL` → keep `http://10.0.2.2:3000` (10.0.2.2 = host localhost). Pull to refresh or reopen to load.
- **Physical device**: use `http://<your-laptop-LAN-IP>:3000`. Allow cleartext (already enabled in the app).
- **Tunnel**: `npx cloudflared tunnel --url http://localhost:3000`, then set the printed `https://…trycloudflare.com` in Settings (or in `gradle.properties` as `GATEWAY_URL` and rebuild).

## Features

- Home dashboard (health, WS status, host shell, server time)
- Chat tab (WS echo + demo assistant reply; wire to your real gateway for live chat)
- Terminal tab (host shell — Mac `zsh` / Termux `bash`, auto-detected, cwd tracked; try `ls`, `pwd`, `whoami`, `opencode run "hi"`)
- OpenCode tab (streaming `opencode run` replies, session continuity)
- Settings tab (gateway URL, WS URL in `localStorage`)
