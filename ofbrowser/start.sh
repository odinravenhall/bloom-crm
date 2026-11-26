#!/bin/sh
set -e
Xvfb :99 -screen 0 1400x1000x24 -nolisten tcp &
export DISPLAY=:99
# Attend que l'écran virtuel réponde (10 s au plus), sinon Chromium démarre avant lui.
i=0
while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i+1)); done
exec node server.mjs