# Standalone vision (Option 1)

**Goal:** install the APK → open it → Chat / Terminal / Files work with **no Termux typing and no Mac**.

## What shipped (this commit)

- `web/` files bundled in the APK at `assets/gateway/` (server.js, app.js, UI, icons).
- `GatewayRuntime` extracts those files to `filesDir/gateway/` on first launch
  (re-extracts when `versionCode` changes).
- `GatewayService` is a foreground service (notification *"Gateway running ✓"*).
  It starts `node server.js` if a Node binary is available and polls
  `http://127.0.0.1:3000/api/health` until ready.
- `MainActivity` auto-starts the service when the URL is localhost and the page
  fails to load, then auto-reloads.
- `OpenCodeSetupActivity`:
  - **Auto-start via Termux (one tap)** — sends the installer to Termux with the
    `RUN_COMMAND` API (needs Termux setting *"Allow external apps to run commands"*).
    Falls back to copy-paste instructions.
  - **Start gateway (in-app service)** button.
- Menu: **Start/Stop gateway (in-app)**.
- Bug fixes: fast `/api/health` (no per-poll process spawn), `~` expansion in
  terminal `cd` and file APIs, `fs` path containment, resilient shell detection,
  fish support, dead-code cleanup.

## What remains for FULL standalone (honest list)

Today the service still needs a **Node runtime** on-device. It finds it in this
order (`GatewayRuntime.findNode`):

1. `filesDir/node/bin/node` — **not bundled yet**
2. `/data/data/com.termux/files/usr/bin/node` — Termux (what works today)

To go fully standalone we still need to bundle, per ABI (`arm64-v8a`,
`armeabi-v7a`, `x86_64`):

1. **Node.js runtime** — e.g. unofficial Node Android builds or a Termux
   `nodejs` .deb extract; needs `libc++` shims. Then `server.js` runs as-is.
2. **OpenCode CLI binary** — provider must publish an Android `arm64` build;
   today `findOpencode()` finds it on Mac (`~/.opencode/bin/opencode`) or in
   Termux. The same `filesDir/opencode/opencode` spot can host it.
3. **First-launch UX** — extract assets → kick off service → WebView waits for
   health check with a progress/splash. Partially done (auto-start + reload).

Recommended order:

1. Publish debug APK as a **GitHub Release** (done in CI when tag `v*` is pushed).
2. Add a CI job that downloads Node (unofficial Android build) + OpenCode into
   the APK per ABI (`assets/node/<abi>/`, `assets/opencode/<abi>/`) and
   extends `GatewayRuntime.findNode` / `findOpencode` to use them.
3. Port `wss` `ws` dependency — `web/node_modules` is NOT bundled (native
   modules). Either bundle prebuilt `ws` (pure JS, can be copied) or vendor
   it into `assets/gateway/node_modules/ws`.

Until step 2 lands, the reliable path is: install Termux → **Auto-start via
Termux** (or copy-paste) → gateway runs inside Termux → app connects to
`127.0.0.1:3000`.
