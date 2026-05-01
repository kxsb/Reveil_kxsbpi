#!/bin/bash
set -u

export HOME="/home/kxsbpi"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

BASE="$HOME/reveil"

PLAYLIST_URL="https://www.youtube.com/watch?v=R8pQBHf11MI&list=PLrbU3Fer_FqZQAknct-7GO-ANrXhfb2Mt"

OUTPUT_DIR="$HOME/music/reveil"
TMP_DIR="$HOME/music/tmp_reveil"
BACKUP_DIR="$HOME/music/reveil_backup_before_update"
MIN_AUDIO_FILES="${MIN_AUDIO_FILES:-3}"

YTDLP="$HOME/.local/bin/yt-dlp"
ANALYZER="$BASE/scripts/playlist/analyze_loudness.py"
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

# Vérifie qu'on a récupéré un nombre plausible de fichiers audio.
# Le seuil par défaut évite de remplacer une bonne playlist par un téléchargement partiel.
AUDIO_COUNT=$(find "$TMP_DIR" -maxdepth 1 -type f \( \
  -iname "*.webm" -o \
  -iname "*.m4a" -o \
  -iname "*.opus" -o \
  -iname "*.mp3" -o \
  -iname "*.aac" \
\) | wc -l)

if [ "$AUDIO_COUNT" -lt "$MIN_AUDIO_FILES" ]; then
  echo "ERREUR: téléchargement suspect ($AUDIO_COUNT fichier(s) audio, minimum $MIN_AUDIO_FILES), playlist actuelle conservée." | tee -a "$LOG_FILE"
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Téléchargement validé : $AUDIO_COUNT fichier(s) audio" >> "$LOG_FILE"

# Remplacement sécurisé du miroir local.
# On conserve l'ancienne playlist jusqu'à validation complète du nouveau miroir.
restore_backup() {
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$OUTPUT_DIR"
    mv "$BACKUP_DIR" "$OUTPUT_DIR"
    echo "Ancienne playlist restaurée depuis $BACKUP_DIR" | tee -a "$LOG_FILE"
  fi
}

rm -rf "$BACKUP_DIR"

if [ -d "$OUTPUT_DIR" ]; then
  mv "$OUTPUT_DIR" "$BACKUP_DIR"
fi

if mv "$TMP_DIR" "$OUTPUT_DIR"; then
  echo "Playlist miroir mise à jour dans $OUTPUT_DIR" >> "$LOG_FILE"
else
  echo "ERREUR: impossible de déplacer le miroir temporaire, restauration." | tee -a "$LOG_FILE"
  restore_backup
  rm -rf "$TMP_DIR"
  exit 1
fi

# Recalcul de l'index loudness.
# Si l'analyse échoue, on restaure l'ancienne playlist pour éviter un état incohérent.
if [ -f "$ANALYZER" ]; then
  echo "Analyse loudness en cours..." >> "$LOG_FILE"

  if python3 "$ANALYZER" "$OUTPUT_DIR" -o "$LOUDNESS_JSON" --relative-paths --target-lufs -18
  then
    echo "Analyse loudness OK -> $LOUDNESS_JSON" >> "$LOG_FILE"
    rm -rf "$BACKUP_DIR"
  else
    echo "ERREUR: analyse loudness échouée, restauration de l'ancienne playlist." | tee -a "$LOG_FILE"
    restore_backup
    exit 1
  fi
else
  echo "ERREUR: script analyse_loudness.py introuvable, restauration de l'ancienne playlist." | tee -a "$LOG_FILE"
  restore_backup
  exit 1
fi

echo "Mise à jour terminée" >> "$LOG_FILE"
