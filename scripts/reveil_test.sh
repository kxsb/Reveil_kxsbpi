#!/bin/bash
set -e

export HOME="/home/kxsbpi"

FILE="$(find "$HOME/music" -type f \( -iname "*.mp3" -o -iname "*.m4a" -o -iname "*.webm" -o -iname "*.opus" \) | shuf -n 1)"

if [ -z "$FILE" ]; then
  echo "Aucun fichier audio trouvé"
  exit 1
fi

GAIN="$(python3 - "$FILE" <<'PY'
import json, sys, os

file = sys.argv[1]
index_path = os.path.expanduser("~/loudness_index.json")

try:
    data = json.load(open(index_path, encoding="utf-8"))
except Exception:
    print("0")
    sys.exit()

tracks = data.get("tracks", {})
basename = os.path.basename(file)

value = tracks.get(file) or tracks.get(basename) or {}
gain = value.get("recommended_gain_db", 0) if isinstance(value, dict) else 0

print(gain)
PY
)"

echo "▶ $FILE"
echo "🔊 gain loudness: ${GAIN} dB"

mpv --no-video \
  --audio-device=alsa/plughw:CARD=Pro,DEV=0 \
  --af="lavfi=[volume=${GAIN}dB]" \
  "$FILE"