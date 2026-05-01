#!/usr/bin/env bash
set -u

BASE_DIR="/home/kxsbpi/reveil"
STATE_DIR="$BASE_DIR/state"
LOG_DIR="$BASE_DIR/logs"
LOG_FILE="$LOG_DIR/player.log"

STATE_FILE="$STATE_DIR/player_state.json"
MPV_PID_FILE="$STATE_DIR/mpv.pid"

WAVEFORM_FILE="$STATE_DIR/audio_waveform.json"
WAVEFORM_PID_FILE="$STATE_DIR/audio_waveform.pid"
WAVEFORM_MANAGER_PID_FILE="$STATE_DIR/audio_waveform_manager.pid"

SOCKET="/tmp/mpv_socket"
WATCHER="$BASE_DIR/scripts/player/audio_waveform_source_watcher.py"

URL="${1:-}"

export HOME="/home/kxsbpi"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$STATE_DIR" "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

atomic_json() {
  local file="$1"
  local payload="$2"
  local tmp="${file}.tmp"

  printf '%s\n' "$payload" > "$tmp"
  mv "$tmp" "$file"
}

write_state_playing() {
  python3 - "$STATE_FILE" "$URL" <<'PY'
import json
import os
import sys
import time

path = sys.argv[1]
url = sys.argv[2]

payload = {
    "status": "playing",
    "context": "manual",
    "mode": "youtube",
    "source_label": "YouTube",
    "url": url,
    "started_at": int(time.time()),
}

tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)

os.replace(tmp, path)
PY
}

write_state_stopped() {
  atomic_json "$STATE_FILE" '{"status":"stopped"}'
}

stop_pid_file() {
  local pid_file="$1"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"

  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
}

stop_waveform_monitor() {
  stop_pid_file "$WAVEFORM_MANAGER_PID_FILE"
  stop_pid_file "$WAVEFORM_PID_FILE"

  atomic_json "$WAVEFORM_FILE" '{"ok":false,"active":false,"level":0,"bars":[]}'
}

start_waveform_watcher() {
  if [ ! -f "$WATCHER" ]; then
    log "Waveform watcher introuvable : $WATCHER"
    return 0
  fi

  python3 "$WATCHER" "$SOCKET" "$WAVEFORM_FILE" "$WAVEFORM_PID_FILE" >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$WAVEFORM_MANAGER_PID_FILE"
  log "Waveform watcher lancé PID=$(cat "$WAVEFORM_MANAGER_PID_FILE")"
}

if [ -z "$URL" ]; then
  log "Erreur lecteur URL : URL manquante"
  write_state_stopped
  exit 1
fi

case "$URL" in
  http://*|https://*) ;;
  *)
    log "Erreur lecteur URL : URL invalide $URL"
    write_state_stopped
    exit 1
    ;;
esac

log "Lecture YouTube demandée : $URL"

rm -f "$SOCKET" "$MPV_PID_FILE"
stop_waveform_monitor

MPV_CMD=(
  /usr/bin/mpv
  --no-video
  --ao=alsa
  --audio-device=alsa/default
  --audio-format=float
  --audio-samplerate=48000
  --volume=80
  --input-ipc-server="$SOCKET"
  --ytdl-format=bestaudio[ext=m4a]/bestaudio/best
  "$URL"
)

"${MPV_CMD[@]}" >> "$LOG_FILE" 2>&1 &
MPV_PID=$!

echo "$MPV_PID" > "$MPV_PID_FILE"
log "mpv YouTube lancé PID=$MPV_PID"

sleep 2

if ! kill -0 "$MPV_PID" 2>/dev/null; then
  log "mpv YouTube arrêté immédiatement"
  rm -f "$MPV_PID_FILE"
  write_state_stopped
  exit 1
fi

write_state_playing
start_waveform_watcher

log "Script play_url terminé"
