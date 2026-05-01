#!/bin/bash

set -x

echo "=== reveil_check lancé $(date) ==="
echo "USER=$USER"
echo "PWD=$PWD"
echo "PATH=$PATH"
echo "HOME=$HOME"
which mpv || true
echo "AUDIO DEVICES:"
aplay -l || true

export HOME="/home/kxsbpi"

CONFIG_FILE="$HOME/reveil.conf"
LOCK_FILE="/tmp/reveil.lock"
PLAY_SCRIPT="$HOME/scripts/play_reveil.sh"
LOG_FILE="$HOME/reveil_debug.log"

CURRENT_TIME=$(date +"%H:%M")
TARGET_TIME=$(cat "$CONFIG_FILE" 2>/dev/null)

echo "$(date '+%F %T') current=$CURRENT_TIME target=$TARGET_TIME" >> "$LOG_FILE"

if [ "$CURRENT_TIME" = "$TARGET_TIME" ] && [ ! -f "$LOCK_FILE" ]; then
    echo "$(date '+%F %T') trigger" >> "$LOG_FILE"
    touch "$LOCK_FILE"
    /bin/bash "$PLAY_SCRIPT" >> "$LOG_FILE" 2>&1 &
fi

if [ "$CURRENT_TIME" != "$TARGET_TIME" ]; then
    rm -f "$LOCK_FILE"
fi
