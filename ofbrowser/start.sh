#!/bin/sh
set -e
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1400x1000x24 -nolisten tcp &
export DISPLAY=:99
i=0
while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i+1)); done
x11vnc -display :99 -forever -shared -nopw -listen 0.0.0.0 -rfbport 5900 >/dev/null 2>&1 &
websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
exec node server.mjs