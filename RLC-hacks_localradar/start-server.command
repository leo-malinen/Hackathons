cd "$(dirname "$0")" || exit 1
PORT=8000

while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "Local Radar running at http://localhost:$PORT"
echo "Press Ctrl+C to stop."

( sleep 1; (open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null) ) &

python3 -m http.server $PORT
