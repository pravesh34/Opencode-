#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (add API keys before using AI generation)."
fi

# Backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if ! python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "Installing backend dependencies (first run may take a few minutes)..."
  pip install -U pip >/dev/null
  pip install -r backend/requirements.txt
fi
mkdir -p data browser_profiles exports

# Frontend
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

cleanup() {
  echo "\nShutting down JobPilot AI..."
  [ -n "${BACK_PID:-}" ] && kill "$BACK_PID" 2>/dev/null || true
  [ -n "${FRONT_PID:-}" ] && kill "$FRONT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://127.0.0.1:8000 ..."
(.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload) &
BACK_PID=$!

echo "Starting frontend on http://127.0.0.1:5173 ..."
(cd frontend && npm run dev) &
FRONT_PID=$!

echo "JobPilot AI is starting. Frontend: http://127.0.0.1:5173  Backend: http://127.0.0.1:8000/docs"
echo "Press Ctrl+C to stop."

wait
