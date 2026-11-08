#!/usr/bin/env bash
# Code-Go — one-line installer for Termux (run on the Android phone)
# curl -fsSL https://raw.githubusercontent.com/pravesh34/Opencode-/code-go/setup-termux.sh | bash
set -e
REPO="https://github.com/pravesh34/Opencode-"
DIR="$HOME/Opencode-"
PORT="${PORT:-3000}"

echo "==> Open Gateway setup (Termux)"

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js..."
  pkg update -y
  pkg install -y nodejs git curl
fi
if ! command -v git >/dev/null 2>&1; then pkg install -y git; fi
if ! command -v curl >/dev/null 2>&1; then pkg install -y curl; fi
echo "==> node $(node --version)"

if [ -d "$DIR/.git" ]; then
  echo "==> Repo found, updating to code-go branch..."
  git -C "$DIR" fetch origin || true
  git -C "$DIR" checkout code-go || git -C "$DIR" checkout -b code-go origin/code-go
  git -C "$DIR" pull --ff-only origin code-go || echo "    (pull skipped, continuing with local code-go)"
else
  echo "==> Cloning repo (code-go branch)..."
  git clone --branch code-go "$REPO" "$DIR"
fi

# main is the Compose app (no web/); the web gateway lives on code-go.
if [ ! -f "$DIR/web/server.js" ]; then
  echo "ERROR: web/server.js missing after checkout — run:"
  echo "  git -C \"\$DIR\" checkout code-go"
  exit 1
fi

cd "$DIR/web"
if [ ! -d node_modules ]; then
  echo "==> npm install..."
  npm install
fi

# stop any previous gateway instance
pkill -f "node server.js" >/dev/null 2>&1 || true
sleep 1

echo "==> Starting gateway on :$PORT..."
nohup node server.js > "$HOME/gateway.log" 2>&1 &
sleep 2

for i in 1 2 3 4 5; do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break || sleep 1
done

if ! curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "FAILED to start. Log:"
  tail -20 "$HOME/gateway.log" || true
  exit 1
fi

echo ""
echo "✅ Gateway running!"
echo "   URL:  http://127.0.0.1:$PORT"
echo "   Log:  $HOME/gateway.log"
echo ""
echo "Next step: open http://127.0.0.1:$PORT in your browser (or Add to Home Screen)."
if command -v opencode >/dev/null 2>&1; then
  echo "   OpenCode: found ($(opencode --version 2>/dev/null || echo ok))"
else
  echo "   OpenCode: not installed yet (chat runs in demo mode until it is)"
fi
echo ""
echo "To stop the gateway:  pkill -f 'node server.js'"
echo "To view logs:          tail -f $HOME/gateway.log"
