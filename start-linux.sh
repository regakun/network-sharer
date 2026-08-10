#!/usr/bin/env bash
echo "=================================================="
echo "        NETWORK SHARER - LINUX LAUNCHER"
echo "=================================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js (e.g. sudo pacman -S nodejs npm or sudo apt install nodejs npm)"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[INFO] First time setup: Installing project dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "UPLOAD_DIR=uploads" > .env
    echo "PORT=3000" >> .env
fi

echo "[INFO] Starting Network Sharer..."
echo "[INFO] Opening Web UI in browser..."
echo ""

(sleep 2 && (xdg-open http://localhost:3000 || open http://localhost:3000) &> /dev/null) &

npm start
