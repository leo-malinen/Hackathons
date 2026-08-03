#!/bin/bash
# Local Radar launcher.
#
# OpenRouter cannot be called from a file:// page - the browser blocks it before
# the request ever leaves your machine, which makes a perfectly good API key look
# broken. This script serves the folder over http and opens it.
#
# macOS: double-click this file (you may need: chmod +x start-server.command)
# Windows / Linux: run  python3 -m http.server 8000  in this folder,
#                  then open http://localhost:8000

cd "$(dirname "$0")" || exit 1
PORT=8000

while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "Local Radar running at http://localhost:$PORT"
echo "Press Ctrl+C to stop."

( sleep 1; (open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null) ) &

python3 -m http.server $PORT
