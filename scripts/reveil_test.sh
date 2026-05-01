#!/bin/bash
set -euo pipefail

export HOME="/home/kxsbpi"

BASE="$HOME/reveil"
MUSIC_DIR="$HOME/music/reveil"
LOUDNESS_INDEX="$BASE/data/loudness_index.json"
LOG_FILE="$BASE/logs/test.log"

mkdir -p "$BASE/logs"

FILE="$(find "$MUSIC_DIR" -type f \( -iname "*.mp3" -o -iname "*.m4a" -o -iname "*.webm" -o -iname "*.opus" -o -iname "*.aac" -o -iname "*.flac" \) | shuf -n 1)"

if [ -z "${FILE:-}" ]; then
  echo "Aucun fichier audio trouvé dans $MUSIC_DIR" | tee -a "$LOG_FILE"
  exit 1
fi

GAIN="$(python3 - "$FILE" "$MUSIC_DIR" "$LOUDNESS_INDEX" <<'PY'
import json
import sys
from pathlib import Path

file = Path(sys.argv[1])
music_dir = Path(sys.argv[2])
index_path = Path(sys.argv[3])

try:
    data = json.loads(index_path.read_text(encoding="utf-8"))
except Exception:
    print("0")
    sys.exit()

tracks = data.get("tracks", {})

try:
    rel = str(file.relative_to(music_dir))
except Exception:
    rel = file.name

value = tracks.get(rel) or tracks.get(file.name) or {}
gain = value.get("recommended_gain_db", 0) if isinstance(value, dict) else 0

print(gain)
PY
)"

echo "Fichier test : $FILE" | tee -a "$LOG_FILE"
echo "Gain loudness : ${GAIN} dB" | tee -a "$LOG_FILE"

mpv --no-video \
  --audio-device=alsa/plughw:CARD=Pro,DEV=0 \
  --af="volume=${GAIN}dB" \
  "$FILE"
