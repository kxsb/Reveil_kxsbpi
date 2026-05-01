#!/bin/bash
set -u

export HOME="/home/kxsbpi"

BASE="$HOME/reveil"

CONFIG_FILE="$BASE/config/reveil.conf"
PLAY_SCRIPT="$BASE/scripts/player/play_reveil.sh"
LOG_FILE="$BASE/logs/alarm.log"
LOCK_FILE="/tmp/reveil_alarm.lock"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "$(date '+%F %T') $*" >> "$LOG_FILE"
}

if [ ! -f "$CONFIG_FILE" ]; then
  log "ERREUR: config introuvable: $CONFIG_FILE"
  exit 1
fi

if [ ! -x "$PLAY_SCRIPT" ]; then
  log "ERREUR: script de lecture introuvable ou non exécutable: $PLAY_SCRIPT"
  exit 1
fi

if ! command -v mpv >/dev/null 2>&1; then
  log "ERREUR: mpv introuvable"
  exit 1
fi

CURRENT_TIME="$(date +"%H:%M")"
TARGET_TIME="$(awk '{print $1}' "$CONFIG_FILE" 2>/dev/null || true)"
MODE="$(awk '{print $2}' "$CONFIG_FILE" 2>/dev/null || true)"
STATION_ID="$(awk '{print $3}' "$CONFIG_FILE" 2>/dev/null || true)"

if [ "$MODE" = "fip" ]; then
  MODE="radio"
  STATION_ID="fip"
fi

if [ "$MODE" = "radio" ] && [ -z "$STATION_ID" ]; then
  STATION_ID="fip"
  
fi

if ! echo "$TARGET_TIME" | grep -Eq '^([01][0-9]|2[0-3]):[0-5][0-9]$'; then
  log "ERREUR: heure invalide dans config: target=$TARGET_TIME"
  exit 1
fi

case "$MODE" in
  playlist|random|radio)
    ;;
  "")
    log "WARN: mode vide, fallback playlist"
    MODE="playlist"
    ;;
  *)
    log "WARN: mode invalide '$MODE', fallback playlist"
    MODE="playlist"
    ;;
esac

log "check current=$CURRENT_TIME target=$TARGET_TIME mode=$MODE station=$STATION_ID"

if [ "$CURRENT_TIME" = "$TARGET_TIME" ] && [ ! -f "$LOCK_FILE" ]; then
  log "ALARM TRIGGER"
  touch "$LOCK_FILE"

  case "$MODE" in
    radio)
      /bin/bash "$PLAY_SCRIPT" radio "$STATION_ID" >> "$LOG_FILE" 2>&1 &
      ;;
    playlist|random|"")
      /bin/bash "$PLAY_SCRIPT" "$MODE" >> "$LOG_FILE" 2>&1 &
      ;;
  esac
fi

if [ "$CURRENT_TIME" != "$TARGET_TIME" ]; then
  rm -f "$LOCK_FILE"
fi

# Anti-veille programmée : utilise le même tick que le réveil.
SLEEP_TICK="/home/kxsbpi/reveil/scripts/alarm/sleep_tick.sh"

if [ -x "$SLEEP_TICK" ]; then
  "$SLEEP_TICK"
fi
