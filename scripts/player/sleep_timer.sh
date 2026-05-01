#!/usr/bin/env bash
set -u

BASE_DIR="/home/kxsbpi/reveil"
STATE_DIR="$BASE_DIR/state"
LOG_DIR="$BASE_DIR/logs"
LOG_FILE="$LOG_DIR/player.log"

STATE_FILE="$STATE_DIR/player_state.json"
WAVEFORM_FILE="$STATE_DIR/audio_waveform.json"
MPV_PID_FILE="$STATE_DIR/mpv.pid"
SOCKET="/tmp/mpv_socket"

TOTAL_SECONDS="${1:-1800}"
FADE_ENABLED="${2:-1}"
FADE_DURATION="${3:-120}"
FADE_CURVE="${4:-ease_out}"

mkdir -p "$STATE_DIR" "$LOG_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
}

safe_int() {
  local value="$1"
  local fallback="$2"

  if [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "$value"
  else
    echo "$fallback"
  fi
}

TOTAL_SECONDS="$(safe_int "$TOTAL_SECONDS" 1800)"
FADE_DURATION="$(safe_int "$FADE_DURATION" 120)"

if [ "$TOTAL_SECONDS" -lt 1 ]; then
  TOTAL_SECONDS=1
fi

if [ "$FADE_DURATION" -lt 1 ]; then
  FADE_DURATION=1
fi

if [ "$FADE_ENABLED" = "1" ]; then
  WAIT_SECONDS=$((TOTAL_SECONDS - FADE_DURATION))
  if [ "$WAIT_SECONDS" -lt 0 ]; then
    WAIT_SECONDS=0
  fi
else
  WAIT_SECONDS="$TOTAL_SECONDS"
fi

log "Anti-veille armée : total=${TOTAL_SECONDS}s fade=${FADE_ENABLED} fade_duration=${FADE_DURATION}s curve=${FADE_CURVE}"

sleep "$WAIT_SECONDS"

python3 - "$SOCKET" "$MPV_PID_FILE" "$STATE_FILE" "$WAVEFORM_FILE" "$FADE_ENABLED" "$FADE_DURATION" "$FADE_CURVE" <<'PY'
import json
import os
import socket
import sys
import time
from pathlib import Path

socket_path = sys.argv[1]
pid_file = Path(sys.argv[2])
state_file = Path(sys.argv[3])
waveform_file = Path(sys.argv[4])
fade_enabled = sys.argv[5] == "1"
fade_duration = max(1, int(sys.argv[6]))
curve = sys.argv[7]

def atomic_write(path, payload):
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)

def mpv_command(command, expect_reply=False):
    if not Path(socket_path).exists():
        return None

    try:
        client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        client.settimeout(1.5)
        client.connect(socket_path)
        client.sendall((json.dumps(command) + "\n").encode("utf-8"))

        if not expect_reply:
            client.close()
            return None

        raw = client.recv(4096).decode("utf-8", errors="ignore")
        client.close()

        if not raw.strip():
            return None

        return json.loads(raw.splitlines()[0])
    except Exception:
        return None

def get_volume():
    response = mpv_command(
        {"command": ["get_property", "volume"]},
        expect_reply=True,
    )

    if not response:
        return 80.0

    try:
        return float(response.get("data"))
    except Exception:
        return 80.0

def set_volume(volume):
    mpv_command({"command": ["set_property", "volume", float(volume)]})

def quit_mpv():
    mpv_command({"command": ["quit"]})

def curve_value(t):
    t = max(0.0, min(1.0, t))

    if curve == "ease_in":
        return t ** 2

    if curve == "ease_out":
        return 1 - ((1 - t) ** 2)

    if curve == "ease_in_out":
        return 3 * (t ** 2) - 2 * (t ** 3)

    return t

if fade_enabled:
    start_volume = get_volume()
    steps = max(8, min(240, fade_duration))
    sleep_time = fade_duration / steps

    for i in range(steps + 1):
        progress = i / steps
        p = curve_value(progress)
        volume = start_volume * (1 - p)
        set_volume(max(0, volume))
        time.sleep(sleep_time)

quit_mpv()

time.sleep(0.8)

if pid_file.exists():
    try:
        pid = int(pid_file.read_text(encoding="utf-8").strip())
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            pass
    except Exception:
        pass

    try:
        pid_file.unlink()
    except Exception:
        pass

atomic_write(state_file, {"status": "stopped"})
atomic_write(waveform_file, {"ok": False, "active": False, "level": 0, "bars": []})
PY

log "Anti-veille terminée"
