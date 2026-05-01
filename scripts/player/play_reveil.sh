#!/bin/bash
set -u

# ============================================================================
# Réveil audio
# Playlist ordonnée + correction loudness par piste + fade-in configurable
# ============================================================================

export HOME="/home/kxsbpi"
export XDG_RUNTIME_DIR="/run/user/$(id -u kxsbpi)"
export LC_NUMERIC=C

BASE="$HOME/reveil"

MUSIC_DIR="$HOME/music/reveil"
LOUDNESS_INDEX="$BASE/data/loudness_index.json"

SETTINGS_FILE="$BASE/config/reveil_settings.conf"

LOG_FILE="$BASE/logs/player.log"
STATE_DIR="$BASE/state"
MPV_PID_FILE="$STATE_DIR/mpv.pid"
STATE_FILE="$STATE_DIR/player_state.json"
WAVEFORM_FILE="$STATE_DIR/audio_waveform.json"
WAVEFORM_PID_FILE="$STATE_DIR/audio_waveform.pid"
WAVEFORM_MANAGER_PID_FILE="$STATE_DIR/audio_waveform_manager.pid"

mkdir -p "$BASE/logs" "$STATE_DIR"

SOCKET="/tmp/mpv_socket"

MODE="${1:-playlist}"
SOURCE_ID="${2:-reveil}"
PLAYER_CONTEXT="${3:-alarm}"
RADIO_STATIONS_FILE="$BASE/config/radio_stations.json"
PLAYLISTS_FILE="$BASE/config/playlists.json"

if [ "$MODE" = "fip" ]; then
  MODE="radio"
  SOURCE_ID="fip"
fi

if [ "$MODE" = "radio" ]; then
  STATION_ID="${SOURCE_ID:-fip}"
  PLAYLIST_ID=""
else
  STATION_ID=""
  PLAYLIST_ID="${SOURCE_ID:-reveil}"
fi

# ----------------------------------------------------------------------------
# Réglages par défaut
# ----------------------------------------------------------------------------
ENABLE_FADE="1"
INITIAL_VOLUME="10"
MAX_VOLUME="80"
FADE_DURATION="120"
FADE_CURVE="linear"
FADE_STEPS="80"

# ----------------------------------------------------------------------------
# Chargement des réglages utilisateur
# ----------------------------------------------------------------------------
if [ -f "$SETTINGS_FILE" ]; then
  # shellcheck source=/dev/null
  source "$SETTINGS_FILE"
fi

# Valeurs de secours si fichier incomplet
ENABLE_FADE="${ENABLE_FADE:-1}"
INITIAL_VOLUME="${INITIAL_VOLUME:-10}"
MAX_VOLUME="${MAX_VOLUME:-80}"
FADE_DURATION="${FADE_DURATION:-120}"
FADE_CURVE="${FADE_CURVE:-linear}"
FADE_STEPS="${FADE_STEPS:-80}"

# ----------------------------------------------------------------------------
# Fonctions utilitaires
# ----------------------------------------------------------------------------
log() {
  echo "$(date '+%F %T') $*" >> "$LOG_FILE"
}

# Le fade-in appartient au réveil.
# Les lectures manuelles radio/lecteur démarrent directement.
# Le contexte "test" respecte les réglages du réveil.
if [ "$PLAYER_CONTEXT" = "manual" ]; then
  ENABLE_FADE="0"
  log "Lecture manuelle : fade-in désactivé"
fi

get_radio_value() {
  local station_id="$1"
  local key="$2"

  python3 - "$RADIO_STATIONS_FILE" "$station_id" "$key" <<'PY'
import json
import sys

path, station_id, key = sys.argv[1], sys.argv[2], sys.argv[3]

with open(path, "r", encoding="utf-8") as f:
    stations = json.load(f)

station = stations.get(station_id, {})
print(station.get(key, ""))
PY
}

radio_stream_url() {
  get_radio_value "$STATION_ID" "stream_url"
}

radio_fallback_url() {
  get_radio_value "$STATION_ID" "fallback_url"
}

source_label() {
  case "$MODE" in
    radio)
      get_radio_value "$STATION_ID" "label"
      ;;
    random)
      echo "Aléatoire"
      ;;
    playlist|"")
      echo "Playlist"
      ;;
    *)
      echo "$MODE"
      ;;
  esac
}

write_state_fading() {
  local started_at="$1"
  local label
  label="$(source_label)"

  mkdir -p "$STATE_DIR"

  cat > "$STATE_FILE" <<EOF
{
  "status": "fading",
  "context": "$PLAYER_CONTEXT",
  "mode": "$MODE",
  "station_id": "$STATION_ID",
  "source_label": "$label",
  "started_at": $started_at,
  "fade_duration": $FADE_DURATION,
  "fade_curve": "$FADE_CURVE",
  "initial_volume": $INITIAL_VOLUME,
  "max_volume": $MAX_VOLUME
}
EOF
}

write_state_playing() {
  local started_at="$1"
  local label
  label="$(source_label)"

  mkdir -p "$STATE_DIR"

  cat > "$STATE_FILE" <<EOF
{
  "status": "playing",
  "context": "$PLAYER_CONTEXT",
  "mode": "$MODE",
  "station_id": "$STATION_ID",
  "source_label": "$label",
  "started_at": $started_at
}
EOF
}

write_state_stopped() {
  mkdir -p "$STATE_DIR"

  cat > "$STATE_FILE" <<EOF
{
  "status": "stopped"
}
EOF
}

stop_waveform_monitor() {
  if [ -f "$WAVEFORM_MANAGER_PID_FILE" ]; then
    local manager_pid
    manager_pid="$(cat "$WAVEFORM_MANAGER_PID_FILE" 2>/dev/null || true)"

    if [ -n "$manager_pid" ]; then
      kill "$manager_pid" 2>/dev/null || true
    fi

    rm -f "$WAVEFORM_MANAGER_PID_FILE"
  fi

  if [ -f "$WAVEFORM_PID_FILE" ]; then
    local pid
    pid="$(cat "$WAVEFORM_PID_FILE" 2>/dev/null || true)"

    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi

    rm -f "$WAVEFORM_PID_FILE"
  fi

  cat > "$WAVEFORM_FILE" <<EOF_WAVEFORM_STOP
{
  "ok": false,
  "active": false,
  "level": 0,
  "bars": []
}
EOF_WAVEFORM_STOP
}

start_waveform_watcher() {
  stop_waveform_monitor

  python3 "$BASE/scripts/player/audio_waveform_source_watcher.py" "$SOCKET" "$WAVEFORM_FILE" "$WAVEFORM_PID_FILE" >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$WAVEFORM_MANAGER_PID_FILE"

  log "Waveform source watcher lancé PID=$(cat "$WAVEFORM_MANAGER_PID_FILE")"
}

start_waveform_monitor() {
  local source="$1"

  if [ -z "$source" ]; then
    return
  fi

  stop_waveform_monitor

  python3 "$BASE/scripts/player/audio_waveform_monitor.py" "$source" "$WAVEFORM_FILE" >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$WAVEFORM_PID_FILE"

  log "Waveform monitor lancé PID=$(cat "$WAVEFORM_PID_FILE") source=$source"
}

is_number() {
  [[ "$1" =~ ^-?[0-9]+([.][0-9]+)?$ ]]
}

get_gain_db() {
  local rel_track="$1"

  if [ ! -f "$LOUDNESS_INDEX" ]; then
    echo "0"
    return
  fi

  python3 - "$LOUDNESS_INDEX" "$rel_track" <<'PY'
import json
import sys

index_file = sys.argv[1]
track = sys.argv[2]

try:
    with open(index_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    gain = data.get("tracks", {}).get(track, {}).get("recommended_gain_db", 0)
    print(float(gain))
except Exception:
    print(0)
PY
}

compute_fade_volumes() {
  python3 - "$INITIAL_VOLUME" "$MAX_VOLUME" "$FADE_STEPS" "$FADE_CURVE" <<'PYVOL'
import sys

start = float(sys.argv[1])
end = float(sys.argv[2])
steps = int(float(sys.argv[3]))
curve = sys.argv[4]

if steps < 1:
    steps = 1

def curve_value(t):
    t = max(0.0, min(1.0, t))

    if curve == "ease_in":
        return t ** 2
    if curve == "ease_out":
        return 1 - ((1 - t) ** 2)
    if curve == "ease_in_out":
        return 3 * (t ** 2) - 2 * (t ** 3)

    return t

for i in range(steps + 1):
    t = i / steps
    p = curve_value(t)
    vol = start + (end - start) * p
    print(round(vol))
PYVOL
}

send_mpv_volume() {
  local vol="$1"
  printf '{ "command": ["set_property", "volume", %d] }\n' "$vol" \
    | socat - "$SOCKET" >/dev/null 2>&1
}

# ----------------------------------------------------------------------------
# Nettoyage préalable
# ----------------------------------------------------------------------------
/usr/bin/pkill -x mpv 2>/dev/null || true
rm -f "$SOCKET"

echo "" >> "$LOG_FILE"
log "=== lancement réveil ==="
STARTED_AT="$(date +%s)"
log "Config: ENABLE_FADE=$ENABLE_FADE INITIAL_VOLUME=$INITIAL_VOLUME MAX_VOLUME=$MAX_VOLUME FADE_DURATION=$FADE_DURATION FADE_CURVE=$FADE_CURVE FADE_STEPS=$FADE_STEPS"



# ----------------------------------------------------------------------------
# Validation basique des réglages
# ----------------------------------------------------------------------------
if ! is_number "$INITIAL_VOLUME"; then INITIAL_VOLUME="10"; fi
if ! is_number "$MAX_VOLUME"; then MAX_VOLUME="80"; fi
if [ "$PLAYER_CONTEXT" = "sleep" ]; then
  # Anti-veille = réveil inversé :
  # départ au volume d'arrivée du réveil, puis fade out vers 0 via sleep_timer.sh.
  log "Anti-veille : fade-in désactivé, volume de départ=${MAX_VOLUME}%"
  ENABLE_FADE=0
  INITIAL_VOLUME="$MAX_VOLUME"
fi

if ! is_number "$FADE_DURATION"; then FADE_DURATION="120"; fi
if ! is_number "$FADE_STEPS"; then FADE_STEPS="80"; fi

case "$FADE_CURVE" in
  linear|ease_in|ease_out|ease_in_out) ;;
  *) FADE_CURVE="linear" ;;
esac

case "$ENABLE_FADE" in
  0|1) ;;
  *) ENABLE_FADE="1" ;;
esac

playlist_output_dir() {
  local playlist_id="${1:-reveil}"

  if [ "$playlist_id" = "reveil" ]; then
    echo "$HOME/music/reveil"
    return 0
  fi

  if [ -f "$PLAYLISTS_FILE" ]; then
    python3 - "$PLAYLISTS_FILE" "$playlist_id" <<'PY'
import json
import sys

config_path, playlist_id = sys.argv[1], sys.argv[2]

try:
    data = json.load(open(config_path, encoding="utf-8"))
    playlist = (data.get("playlists") or {}).get(playlist_id) or {}
    print(playlist.get("output_dir") or f"/home/kxsbpi/music/playlists/{playlist_id}")
except Exception:
    print(f"/home/kxsbpi/music/playlists/{playlist_id}")
PY
  else
    echo "$HOME/music/playlists/$playlist_id"
  fi
}

playlist_loudness_file() {
  local playlist_id="${1:-reveil}"

  if [ "$playlist_id" = "reveil" ]; then
    echo "$BASE/data/loudness_index.json"
    return 0
  fi

  if [ -f "$PLAYLISTS_FILE" ]; then
    python3 - "$PLAYLISTS_FILE" "$playlist_id" "$BASE" <<'PY'
import json
import sys

config_path, playlist_id, base = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    data = json.load(open(config_path, encoding="utf-8"))
    playlist = (data.get("playlists") or {}).get(playlist_id) or {}
    print(playlist.get("loudness_file") or f"{base}/data/loudness_{playlist_id}.json")
except Exception:
    print(f"{base}/data/loudness_{playlist_id}.json")
PY
  else
    echo "$BASE/data/loudness_$playlist_id.json"
  fi
}

if [ "$MODE" != "radio" ]; then
  MUSIC_DIR="$(playlist_output_dir "$PLAYLIST_ID")"
  LOUDNESS_INDEX="$(playlist_loudness_file "$PLAYLIST_ID")"
  log "Playlist locale sélectionnée : id=$PLAYLIST_ID dir=$MUSIC_DIR loudness=$LOUDNESS_INDEX"
fi

# ----------------------------------------------------------------------------
# Récupération de la source audio
# ----------------------------------------------------------------------------
if [ "$MODE" = "radio" ]; then
  RADIO_URL="$(radio_stream_url)"
  FALLBACK_URL="$(radio_fallback_url)"

  if [ -z "$RADIO_URL" ]; then
    log "ERREUR: URL radio introuvable pour station=$STATION_ID"
    exit 1
  fi

  TRACKS=("$RADIO_URL")
  log "Mode radio sélectionné (HQ) : station=$STATION_ID url=$RADIO_URL"

  USE_FALLBACK=0

else

  mapfile -d '' TRACKS < <(
    find "$MUSIC_DIR" -maxdepth 1 -type f \( \
      -iname "*.mp3"  -o \
      -iname "*.flac" -o \
      -iname "*.wav"  -o \
      -iname "*.m4a"  -o \
      -iname "*.aac"  -o \
      -iname "*.ogg"  -o \
      -iname "*.opus" -o \
      -iname "*.webm" \
    \) -print0 | sort -z
  )

  if [ "${#TRACKS[@]}" -eq 0 ]; then
    log "ERREUR: aucun fichier audio trouvé dans $MUSIC_DIR"
    exit 1
  fi

  if [ "$MODE" = "random" ]; then
    log "Mode random : mélange de la playlist id=${PLAYLIST_ID:-reveil}"
    mapfile -d '' TRACKS < <(printf '%s\0' "${TRACKS[@]}" | shuf -z)
  fi

  log "Playlist détectée id=${PLAYLIST_ID:-reveil} : ${#TRACKS[@]} piste(s)"
fi

# ----------------------------------------------------------------------------
# Construction de la commande mpv
# ----------------------------------------------------------------------------
START_VOLUME="$INITIAL_VOLUME"
if [ "$ENABLE_FADE" = "0" ]; then
  START_VOLUME="$MAX_VOLUME"
fi

log "Volume de lancement : $START_VOLUME% fade=$ENABLE_FADE"

MPV_CMD=(
  /usr/bin/mpv
  --no-video
  --ao=alsa
  --audio-device=alsa/default
  --audio-format=float
  --audio-samplerate=48000
  --volume="$START_VOLUME"
  --input-ipc-server="$SOCKET"
)

for TRACK in "${TRACKS[@]}"; do
  MPV_CMD+=(--{)

  if [ "$MODE" = "radio" ]; then
    log "Source stream radio : $(source_label)"
  else
    REL_TRACK="${TRACK#$MUSIC_DIR/}"
    GAIN_DB="$(get_gain_db "$REL_TRACK")"
    GAIN_DB="$(printf '%s' "$GAIN_DB" | tr -d '\r\n')"

    log "Piste : $REL_TRACK | gain brut : $GAIN_DB dB"

    if is_number "$GAIN_DB"; then
      MPV_CMD+=(--af="volume=${GAIN_DB}dB")
      log "Gain loudness appliqué : $REL_TRACK => ${GAIN_DB} dB"
    else
      log "Gain invalide pour $REL_TRACK, lecture sans correction"
    fi
  fi

  MPV_CMD+=("$TRACK")
  MPV_CMD+=(--})
done

# ----------------------------------------------------------------------------
# Lancement mpv
# ----------------------------------------------------------------------------
stop_waveform_monitor
mkdir -p "$(dirname "$MPV_PID_FILE")"
rm -f "$MPV_PID_FILE"

"${MPV_CMD[@]}" >> "$LOG_FILE" 2>&1 &
MPV_PID=$!
echo "$MPV_PID" > "$MPV_PID_FILE"
log "mpv lancé PID=$MPV_PID"

sleep 2

if ! kill -0 "$MPV_PID" 2>/dev/null; then
  log "Échec flux principal, tentative fallback..."

  if [ "$MODE" = "radio" ] && [ -n "$FALLBACK_URL" ]; then
    MPV_CMD=(
      /usr/bin/mpv
      --no-video
      --ao=alsa
      --audio-device=alsa/default
      --audio-format=float
      --audio-samplerate=48000
      --volume="$START_VOLUME"
      --input-ipc-server="$SOCKET"
      "$FALLBACK_URL"
    )

    "${MPV_CMD[@]}" >> "$LOG_FILE" 2>&1 &
    MPV_PID=$!
    echo "$MPV_PID" > "$MPV_PID_FILE"
    log "Fallback lancé : $FALLBACK_URL"
  else
    log "Aucun fallback disponible"
    exit 1
  fi
fi

# ----------------------------------------------------------------------------
# Attente socket IPC
# ----------------------------------------------------------------------------
for _ in $(seq 1 20); do
  [ -S "$SOCKET" ] && break
  sleep 0.5
done

if [ ! -S "$SOCKET" ]; then
  log "ERREUR: socket mpv introuvable"
  exit 1
fi

log "Socket mpv OK : $SOCKET"

start_waveform_watcher

# ----------------------------------------------------------------------------
# Fade-in configurable
# ----------------------------------------------------------------------------
if [ "$ENABLE_FADE" = "1" ]; then
  FADE_STEP_SLEEP="$(python3 - "$FADE_DURATION" "$FADE_STEPS" <<'PY'
import sys
duration = float(sys.argv[1])
steps = float(sys.argv[2])
print(round(duration / steps, 3) if steps else 1)
PY
)"
  write_state_fading "$STARTED_AT"

  log "Fade activé : durée=${FADE_DURATION}s courbe=${FADE_CURVE} départ=${INITIAL_VOLUME}% max=${MAX_VOLUME}% step_sleep=${FADE_STEP_SLEEP}s"

  mapfile -t FADE_VOLUMES < <(compute_fade_volumes)
  log "Fade volumes pré-calculés : ${#FADE_VOLUMES[@]} point(s)"

  FADE_INDEX=0
  FADE_LAST_INDEX=$((${#FADE_VOLUMES[@]} - 1))

  for VOL in "${FADE_VOLUMES[@]}"; do
    if ! kill -0 "$MPV_PID" 2>/dev/null; then
      log "mpv arrêté pendant le fade"
      write_state_stopped
      exit 0
    fi

    if [ ! -S "$SOCKET" ]; then
      log "socket mpv disparu pendant le fade"
      write_state_stopped
      exit 0
    fi

    if [ "$FADE_INDEX" -eq 0 ] || [ "$FADE_INDEX" -eq "$FADE_LAST_INDEX" ] || [ $((FADE_INDEX % 10)) -eq 0 ]; then
      log "fade volume -> $VOL"
    fi

    send_mpv_volume "$VOL"
    FADE_INDEX=$((FADE_INDEX + 1))
    sleep "$FADE_STEP_SLEEP"
  done

if kill -0 "$MPV_PID" 2>/dev/null; then
  log "Fade-in terminé"
  write_state_playing "$STARTED_AT"
else
  log "mpv déjà arrêté après fade"
  write_state_stopped
fi
else
  write_state_playing "$STARTED_AT"
  log "Fade désactivé"
fi

log "Script play_reveil terminé"
