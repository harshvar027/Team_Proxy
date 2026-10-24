#!/usr/bin/env bash
# Baari — start the app from the project root
set -e
cd "$(dirname "$0")"

# Use local virtual environment (.venv)
VENV=".venv"

if [ ! -d "$VENV" ]; then
  echo "Creating virtual environment with python3..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip -q
  "$VENV/bin/pip" install -r requirements.txt -q
fi

# Run database migrations
"$VENV/bin/python" -m alembic upgrade head

# Start the server
exec "$VENV/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
