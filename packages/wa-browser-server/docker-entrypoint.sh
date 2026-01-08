#!/bin/bash
set -e

# Start Xvfb (virtual framebuffer for headful Chrome)
echo "Starting Xvfb..."
Xvfb :99 -screen 0 1024x768x24 -ac &
sleep 2

# Start fluxbox window manager (minimal)
echo "Starting fluxbox..."
fluxbox &
sleep 1

# Optionally start VNC server for debugging
if [ "$ENABLE_VNC" = "true" ]; then
    echo "Starting VNC server on port 5900..."
    x11vnc -display :99 -forever -nopw -quiet &
fi

# Start the Node.js server
echo "Starting WA Browser Server..."
exec node dist/server.js
