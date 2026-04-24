#!/bin/bash
# Uni Planner — start both servers
# Node.js is installed at ~/.local/node

export PATH="$HOME/.local/node/bin:$PATH"

echo "Starting Uni Planner..."
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

cd "$(dirname "$0")"
npm run dev
