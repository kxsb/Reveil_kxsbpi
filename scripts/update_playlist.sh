#!/bin/bash
set -u

export HOME="/home/kxsbpi"

BASE="$HOME/reveil"

PLAYLIST_URL="https://www.youtube.com/watch?v=R8pQBHf11MI&list=PLrbU3Fer_FqZQAknct-7GO-ANrXhfb2Mt"

OUTPUT_DIR="$HOME/music/reveil"
TMP_DIR="$HOME/music/tmp_reveil"

YTDLP="$HOME/.local/bin/yt-dlp"
ANALYZER="$BASE/scripts/analyze_loudness.py"
LOUDNESS_JSON="$BASE/data/loudness_index.json"
LOG_FILE="$BASE/logs/update.log"

mkdir -p "$HOME/music"
mkdir -p "$BASE/data"
mkdir -p "$BASE/logs"

LOCK_FILE="/tmp/reveil_update_playlist.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Mise à jour déjà en cours, abandon." | tee -a "$LOG_FILE"
  exit 1
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

cd "$HOME" || exit 1

if [ ! -x "$YTDLP" ]; then
  echo "ERREUR: yt-dlp introuvable ($YTDLP)" | tee -a "$LOG_FILE"
  exit 1
fi

# Téléchargement playlist dans un dossier temporaire
if "$YTDLP" \
  -f "bestaudio/best" \
  --yes-playlist \
  --ignore-errors \
  --no-overwrites \
  -o "$TMP_DIR/%(playlist_index)02d - %(title)s.%(ext)s" \
  "$PLAYLIST_URL"
then
  echo "Téléchargement OK" >> "$LOG_FILE"
else
  echo "Téléchargement échoué, playlist actuelle conservée." | tee -a "$LOG_FILE"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Vérifie qu'on a bien récupéré au moins un fichier
if ! find "$TMP_DIR" -maxdepth 1 -type f | grep -q .; then
  echo "ERREUR: aucun fichier téléchargé, playlist actuelle conservée." | tee -a "$LOG_FILE"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Remplacement atomique-ish du miroir local
rm -rf "$OUTPUT_DIR"
mv "$TMP_DIR" "$OUTPUT_DIR"
echo "Playlist miroir mise à jour dans $OUTPUT_DIR" >> "$LOG_FILE"

# Recalcul de l'index loudness
if [ -f "$ANALYZER" ]; then
  echo "Analyse loudness en cours..." >> "$LOG_FILE"

  if python3 "$ANALYZER" "$OUTPUT_DIR" -o "$LOUDNESS_JSON" --relative-paths --target-lufs -18
  then
    echo "Analyse loudness OK -> $LOUDNESS_JSON" >> "$LOG_FILE"
  else
    echo "ERREUR: analyse loudness échouée" | tee -a "$LOG_FILE"
    exit 1
  fi
else
  echo "ERREUR: script analyse_loudness.py introuvable ou non exécutable" | tee -a "$LOG_FILE"
  exit 1
fi

echo "Mise à jour terminée" >> "$LOG_FILE"
