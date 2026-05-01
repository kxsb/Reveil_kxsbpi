#!/usr/bin/env bash
set -u

BASE="/home/kxsbpi/reveil"
CONFIG_FILE="$BASE/config/sleep.conf"
STATE_DIR="$BASE/state"
LOG_FILE="$BASE/logs/player.log"

PLAY_SCRIPT="$BASE/scripts/player/play_reveil.sh"
SLEEP_TIMER_SCRIPT="$BASE/scripts/player/sleep_timer.sh"

mkdir -p "$STATE_DIR" "$BASE/logs"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
}

if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

read -r SLEEP_TIME SOURCE FADE_ENABLED DURATION CURVE < "$CONFIG_FILE"

NOW="$(date '+%H:%M')"
TODAY="$(date '+%Y-%m-%d')"
RUN_KEY="$TODAY $SLEEP_TIME"
LAST_RUN_FILE="$STATE_DIR/sleep_last_run.txt"

if [ "$NOW" != "$SLEEP_TIME" ]; then
  exit 0
fi

if [ -f "$LAST_RUN_FILE" ] && [ "$(cat "$LAST_RUN_FILE")" = "$RUN_KEY" ]; then
  exit 0
fi

echo "$RUN_KEY" > "$LAST_RUN_FILE"

PLAY_MODE="random"
SOURCE_ID="reveil"

case "$SOURCE" in
  random|playlist)
    PLAY_MODE="$SOURCE"
    SOURCE_ID="reveil"
    ;;
  *:*)
    PLAY_MODE="${SOURCE%%:*}"
    SOURCE_ID="${SOURCE#*:}"
    ;;
  *)
    PLAY_MODE="random"
    SOURCE_ID="reveil"
    ;;
esac

if [ "$FADE_ENABLED" != "1" ]; then
  FADE_ENABLED="0"
fi

if ! [[ "$DURATION" =~ ^[0-9]+$ ]]; then
  DURATION="900"
fi

case "$CURVE" in
  linear|ease_in|ease_out|ease_in_out) ;;
  *) CURVE="ease_out" ;;
esac

log "Anti-veille déclenchée : time=$SLEEP_TIME source=$SOURCE mode=$PLAY_MODE id=$SOURCE_ID fade=$FADE_ENABLED duration=${DURATION}s curve=$CURVE"

curl -s -X POST http://127.0.0.1:8080/stop >/dev/null 2>&1 || true
sleep 1

nohup /bin/bash "$PLAY_SCRIPT" "$PLAY_MODE" "$SOURCE_ID" sleep >> "$LOG_FILE" 2>&1 &
sleep 2

nohup /bin/bash "$SLEEP_TIMER_SCRIPT" "$DURATION" "$FADE_ENABLED" "$DURATION" "$CURVE" >> "$LOG_FILE" 2>&1 &
