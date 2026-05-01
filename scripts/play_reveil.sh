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
STATE_FILE="$STATE_DIR/player_state.json"

SOCKET="/tmp/mpv_socket"

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

write_state_fading() {
  local started_at="$1"

  mkdir -p "$STATE_DIR"

  cat > "$STATE_FILE" <<EOF
{
  "status": "fading",
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

  mkdir -p "$STATE_DIR"

  cat > "$STATE_FILE" <<EOF
{
  "status": "playing",
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

compute_volume() {
  local i="$1"

  python3 - "$INITIAL_VOLUME" "$MAX_VOLUME" "$FADE_STEPS" "$i" "$FADE_CURVE" <<'PY'
import sys

start = float(sys.argv[1])
end = float(sys.argv[2])
steps = float(sys.argv[3])
i = float(sys.argv[4])
curve = sys.argv[5]

t = i / steps if steps else 1.0
t = max(0.0, min(1.0, t))

if curve == "ease_in":
    p = t ** 2
elif curve == "ease_out":
    p = 1 - ((1 - t) ** 2)
elif curve == "ease_in_out":
    p = 3 * (t ** 2) - 2 * (t ** 3)
else:
    p = t

vol = start + (end - start) * p
print(round(vol))
PY
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

# ----------------------------------------------------------------------------
# Récupération des pistes audio
# ----------------------------------------------------------------------------
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

log "Playlist détectée : ${#TRACKS[@]} piste(s)"

# ----------------------------------------------------------------------------
# Construction de la commande mpv
# ----------------------------------------------------------------------------
MPV_CMD=(
  /usr/bin/mpv
  --no-video
  --ao=alsa
  --audio-device=alsa/default
  --audio-format=float
  --audio-samplerate=48000
  --volume="$INITIAL_VOLUME"
  --input-ipc-server="$SOCKET"
)

for TRACK in "${TRACKS[@]}"; do
  REL_TRACK="${TRACK#$MUSIC_DIR/}"
  GAIN_DB="$(get_gain_db "$REL_TRACK")"
  GAIN_DB="$(printf '%s' "$GAIN_DB" | tr -d '\r\n')"

  log "Piste : $REL_TRACK | gain brut : $GAIN_DB dB"

  MPV_CMD+=(--{)

  if is_number "$GAIN_DB"; then
    MPV_CMD+=(--af="volume=${GAIN_DB}dB")
    log "Gain loudness appliqué : $REL_TRACK => ${GAIN_DB} dB"
  else
    log "Gain invalide pour $REL_TRACK, lecture sans correction"
  fi

  MPV_CMD+=("$TRACK")
  MPV_CMD+=(--})
done

# ----------------------------------------------------------------------------
# Lancement mpv
# ----------------------------------------------------------------------------
"${MPV_CMD[@]}" >> "$LOG_FILE" 2>&1 &

MPV_PID=$!
log "mpv lancé PID=$MPV_PID"

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

  for i in $(seq 0 "$FADE_STEPS"); do
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

    VOL="$(compute_volume "$i")"
    log "fade volume -> $VOL"
    send_mpv_volume "$VOL"
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