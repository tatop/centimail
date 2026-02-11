#!/bin/bash

# Start backend
echo "Starting backend on http://localhost:8000..."
uv run python -m backend.server &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 2

# Start frontend
echo "Starting frontend on http://localhost:5173..."
cd frontend
bun run dev &
FRONTEND_PID=$!

echo ""
echo "✓ Gmail Classifier is running!"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait