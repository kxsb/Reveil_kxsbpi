#!/usr/bin/env python3
import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


BASE_DIR = Path("/home/kxsbpi/reveil")
CONFIG_FILE = BASE_DIR / "config" / "playlists.json"
LOG_FILE = BASE_DIR / "logs" / "playlist_sync.log"
ANALYZER = BASE_DIR / "scripts" / "playlist" / "analyze_loudness.py"

DEFAULT_REVEIL_URL = "https://www.youtube.com/watch?v=R8pQBHf11MI&list=PLrbU3Fer_FqZQAknct-7GO-ANrXhfb2Mt"

AUDIO_EXTENSIONS = {
    ".webm", ".m4a", ".opus", ".mp3", ".aac", ".ogg", ".oga", ".flac", ".wav"
}


def log(message):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def default_config():
    return {
        "playlists": {
            "reveil": {
                "label": "Réveil",
                "url": DEFAULT_REVEIL_URL,
                "output_dir": "/home/kxsbpi/music/reveil",
                "loudness_file": str(BASE_DIR / "data" / "loudness_index.json"),
                "target_lufs": -18,
                "min_audio_files": 3,
            }
        }
    }


def load_config():
    if not CONFIG_FILE.exists():
        return default_config()

    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return default_config()

    if not isinstance(data, dict):
        return default_config()

    data.setdefault("playlists", {})
    data["playlists"].setdefault("reveil", default_config()["playlists"]["reveil"])

    return data


def find_ytdlp():
    candidates = [
        Path.home() / ".local" / "bin" / "yt-dlp",
        Path("/usr/local/bin/yt-dlp"),
        Path("/usr/bin/yt-dlp"),
    ]

    for candidate in candidates:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return str(candidate)

    found = shutil.which("yt-dlp")
    if found:
        return found

    raise RuntimeError("yt-dlp introuvable")


def count_audio_files(directory):
    return sum(
        1 for path in directory.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    )


def run_command(args, **kwargs):
    log("Commande : " + " ".join(str(a) for a in args))
    return subprocess.run(args, text=True, check=False, **kwargs)


def sync_playlist(playlist_id):
    config = load_config()
    playlists = config.get("playlists", {})

    if playlist_id not in playlists:
        raise RuntimeError(f"Playlist inconnue : {playlist_id}")

    playlist = playlists[playlist_id]

    url = playlist.get("url", "").strip()
    label = playlist.get("label", playlist_id)

    if not url:
        raise RuntimeError("URL vide")

    output_dir = Path(playlist.get("output_dir") or f"/home/kxsbpi/music/playlists/{playlist_id}")

    if playlist_id == "reveil":
        # Compat historique.
        tmp_dir = Path("/home/kxsbpi/music/tmp_reveil")
        backup_dir = Path("/home/kxsbpi/music/reveil_backup_before_update")
    else:
        # Nouvelles playlists : tmp et backups isolés.
        tmp_dir = Path(f"/home/kxsbpi/music/tmp/{playlist_id}")
        backup_dir = Path(f"/home/kxsbpi/music/backups/{playlist_id}")
    loudness_file = Path(playlist.get("loudness_file") or BASE_DIR / "data" / f"loudness_{playlist_id}.json")

    target_lufs = str(playlist.get("target_lufs", -18))
    min_audio_files = int(playlist.get("min_audio_files", 3))

    ytdlp = find_ytdlp()

    log(f"Synchronisation playlist '{label}' ({playlist_id})")
    log(f"URL : {url}")
    log(f"Dossier cible : {output_dir}")

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir.parent.mkdir(parents=True, exist_ok=True)
    backup_dir.parent.mkdir(parents=True, exist_ok=True)
    loudness_file.parent.mkdir(parents=True, exist_ok=True)

    shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    proc = run_command([
        ytdlp,
        "-f", "bestaudio/best",
        "--yes-playlist",
        "--ignore-errors",
        "--no-overwrites",
        "-o", str(tmp_dir / "%(playlist_index)02d - %(title)s.%(ext)s"),
        url,
    ])

    if proc.returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise RuntimeError("Téléchargement échoué")

    audio_count = count_audio_files(tmp_dir)

    if audio_count < min_audio_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise RuntimeError(
            f"Téléchargement suspect : {audio_count} fichier(s), minimum {min_audio_files}"
        )

    log(f"Téléchargement validé : {audio_count} fichier(s) audio")

    shutil.rmtree(backup_dir, ignore_errors=True)

    if output_dir.exists():
        output_dir.rename(backup_dir)

    try:
        tmp_dir.rename(output_dir)

        if not ANALYZER.exists():
            raise RuntimeError(f"analyse_loudness.py introuvable : {ANALYZER}")

        proc = run_command([
            sys.executable,
            str(ANALYZER),
            str(output_dir),
            "-o", str(loudness_file),
            "--relative-paths",
            "--target-lufs", target_lufs,
        ])

        if proc.returncode != 0:
            raise RuntimeError("Analyse loudness échouée")

        shutil.rmtree(backup_dir, ignore_errors=True)
        log(f"Synchronisation terminée : {playlist_id}")
        log(f"Loudness : {loudness_file}")

    except Exception:
        log("Erreur après remplacement, restauration éventuelle")

        shutil.rmtree(output_dir, ignore_errors=True)

        if backup_dir.exists():
            backup_dir.rename(output_dir)

        raise


def main():
    playlist_id = sys.argv[1] if len(sys.argv) > 1 else "reveil"

    lock_path = Path(f"/tmp/reveil_sync_playlist_{playlist_id}.lock")

    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(f"Synchronisation déjà en cours : {playlist_id}")

        try:
            sync_playlist(playlist_id)
        except Exception as e:
            log(f"ERREUR sync {playlist_id} : {e}")
            raise SystemExit(1)


if __name__ == "__main__":
    main()
