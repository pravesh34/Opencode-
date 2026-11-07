#!/usr/bin/env bash
# Open Gateway — start the web gateway on Mac (phone uses your LAN IP)
# ./start-mac.sh
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3000}"

echo "==> Open Gateway (Mac)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install it first:"
  echo "  brew install node      (or https://nodejs.org)"
  exit 1
fi
echo "==> node $(node --version)"

cd "$DIR/web"
if [ ! -d node_modules ]; then
  echo "==> npm install..."
  npm install
fi

pkill -f "node server.js" >/dev/null 2>&1 || true
sleep 1

echo "==> Starting gateway on :$PORT..."
nohup node server.js > "$HOME/gateway.log" 2>&1 &
sleep 2

for i in 1 2 3 4 5; do
  curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break || sleep 1
done

if ! curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "FAILED to start. Log:"
  tail -20 "$HOME/gateway.log" || true
  exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || echo '')"
echo ""
echo "✅ Gateway running!"
echo "   Mac:   http://localhost:$PORT"
if [ -n "$LAN_IP" ]; then
  echo "   Phone (same WiFi): http://$LAN_IP:$PORT"
fi
echo "   Log: $HOME/gateway.log"
echo ""
echo "In the phone app → Settings → Gateway URL, use the Phone (LAN) URL above."
if command -v opencode >/dev/null 2>&1; then
  echo "   OpenCode: found ($(opencode --version 2>/dev/null || echo ok))"
else
  echo "   OpenCode: not found in PATH (chat runs in demo mode)"
fi
echo ""
echo "To stop: pkill -f 'node server.js'"
