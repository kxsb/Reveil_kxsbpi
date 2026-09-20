#!/usr/bin/env bash
set -u

BASE="/home/kxsbpi/reveil"
STATE_DIR="$BASE/state"
LOG_FILE="$BASE/logs/player.log"

MPV_PID_FILE="$STATE_DIR/mpv.pid"
MANUAL_VOLUME_OVERRIDE_FILE="$STATE_DIR/manual_volume_override.pid"
SOCKET="/tmp/mpv_socket"

mkdir -p "$STATE_DIR" "$BASE/logs"

log() {
    echo "$(date '+%F %T') $*" >> "$LOG_FILE"
}

is_owned_mpv() {
    local pid="$1"

    [ -n "$pid" ] || return 1
    [ -r "/proc/$pid/cmdline" ] || return 1

    local cmd
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"

    [[ "$cmd" == *"mpv"* ]] &&
    [[ "$cmd" == *"--input-ipc-server=$SOCKET"* ]]
}

PIDS=()

PID_FILE_VALUE="$(cat "$MPV_PID_FILE" 2>/dev/null || true)"

if is_owned_mpv "$PID_FILE_VALUE"; then
    PIDS+=("$PID_FILE_VALUE")
fi

while read -r pid; do
    [ -n "$pid" ] || continue

    if is_owned_mpv "$pid"; then
        already=0

        for existing in "${PIDS[@]}"; do
            if [ "$existing" = "$pid" ]; then
                already=1
                break
            fi
        done

        if [ "$already" -eq 0 ]; then
            PIDS+=("$pid")
        fi
    fi
done < <(pgrep -x mpv 2>/dev/null || true)

for pid in "${PIDS[@]}"; do
    log "Arrêt MPV Maison Sonore PID=$pid"

    kill "$pid" 2>/dev/null || true
done

for pid in "${PIDS[@]}"; do
    for _ in $(seq 1 30); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
    done

    if kill -0 "$pid" 2>/dev/null; then
        log "SIGKILL MPV Maison Sonore PID=$pid"
        kill -9 "$pid" 2>/dev/null || true
    fi
done

rm -f "$MPV_PID_FILE"
rm -f "$MANUAL_VOLUME_OVERRIDE_FILE"
rm -f "$SOCKET"

exit 0
