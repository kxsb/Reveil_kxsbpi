#!/bin/bash
set -u

export HOME="/home/kxsbpi"

BASE="$HOME/reveil"

CONFIG_FILE="$BASE/config/reveil.conf"
PLAY_SCRIPT="$BASE/scripts/play_reveil.sh"
LOG_FILE="$BASE/logs/alarm.log"
LOCK_FILE="/tmp/reveil_alarm.lock"

CURRENT_TIME="$(date +"%H:%M")"
TARGET_TIME="$(awk '{print $1}' "$CONFIG_FILE" 2>/dev/null || true)"
MODE="$(awk '{print $2}' "$CONFIG_FILE" 2>/dev/null || true)"

echo "$(date '+%F %T') check current=$CURRENT_TIME target=$TARGET_TIME mode=$MODE" >> "$LOG_FILE"

if [ "$CURRENT_TIME" = "$TARGET_TIME" ] && [ ! -f "$LOCK_FILE" ]; then
  echo "$(date '+%F %T') ALARM TRIGGER" >> "$LOG_FILE"
  touch "$LOCK_FILE"

  case "$MODE" in
    fip)
      /usr/bin/mpv --no-video --audio-device=alsa/plughw:CARD=Pro,DEV=0 "https://icecast.radiofrance.fr/fip-midfi.mp3" >> "$LOG_FILE" 2>&1 &
      ;;
    playlist|random|"")
      /bin/bash "$PLAY_SCRIPT" >> "$LOG_FILE" 2>&1 &
      ;;
    *)
      /bin/bash "$PLAY_SCRIPT" >> "$LOG_FILE" 2>&1 &
      ;;
  esac
fi

if [ "$CURRENT_TIME" != "$TARGET_TIME" ]; then
  rm -f "$LOCK_FILE"
fi