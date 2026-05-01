import json
import re
from pathlib import Path
from urllib.parse import urlparse

from services.paths import PLAYLISTS_FILE, BASE_DIR


PLAYLIST_ID_RE = re.compile(r"^[a-z0-9_-]{2,40}$")

DEFAULT_REVEIL_URL = "https://www.youtube.com/watch?v=R8pQBHf11MI&list=PLrbU3Fer_FqZQAknct-7GO-ANrXhfb2Mt"


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


def read_playlist_config():
    if not PLAYLISTS_FILE.exists():
        return default_config()

    try:
        data = json.loads(PLAYLISTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return default_config()

    if not isinstance(data, dict):
        return default_config()

    playlists = data.get("playlists")

    if not isinstance(playlists, dict):
        data["playlists"] = {}

    # Toujours garder une entrée réveil de secours.
    data["playlists"].setdefault("reveil", default_config()["playlists"]["reveil"])

    return data


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def save_playlist_config(data):
    atomic_write_json(PLAYLISTS_FILE, data)


def list_playlists():
    data = read_playlist_config()
    playlists = []

    for playlist_id, playlist in sorted(data.get("playlists", {}).items()):
        item = dict(playlist)
        item["id"] = playlist_id
        playlists.append(item)

    return playlists


def validate_playlist_id(value):
    value = (value or "").strip().lower().replace(" ", "_")

    if not PLAYLIST_ID_RE.match(value):
        return "", "Identifiant invalide : lettres minuscules, chiffres, tirets ou underscores"

    return value, ""


def is_youtube_playlist_url(url):
    parsed = urlparse((url or "").strip())
    host = (parsed.netloc or "").lower()

    allowed_hosts = {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
    }

    if parsed.scheme not in ["http", "https"] or host not in allowed_hosts:
        return False

    # On accepte une vidéo simple ou une playlist,
    # mais l'usage attendu ici est surtout list=...
    return True


def add_or_update_playlist(playlist_id, label, url):
    playlist_id, error = validate_playlist_id(playlist_id)

    if error:
        return None, error

    url = (url or "").strip()
    label = (label or playlist_id).strip()

    if not is_youtube_playlist_url(url):
        return None, "URL YouTube invalide"

    data = read_playlist_config()
    playlists = data.setdefault("playlists", {})

    # Compat spéciale : réveil conserve les chemins historiques.
    if playlist_id == "reveil":
        # Compat historique : la playlist réveil reste au même endroit.
        output_dir = "/home/kxsbpi/music/reveil"
        loudness_file = str(BASE_DIR / "data" / "loudness_index.json")
    else:
        # Nouvelles playlists : rangement dédié pour éviter tout mélange.
        output_dir = f"/home/kxsbpi/music/playlists/{playlist_id}"
        loudness_file = str(BASE_DIR / "data" / f"loudness_{playlist_id}.json")

    playlists[playlist_id] = {
        "label": label,
        "url": url,
        "output_dir": output_dir,
        "loudness_file": loudness_file,
        "target_lufs": -18,
        "min_audio_files": 3,
    }

    save_playlist_config(data)

    item = dict(playlists[playlist_id])
    item["id"] = playlist_id

    return item, ""


AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".oga", ".wav", ".flac", ".webm"}


def format_bytes(value):
    value = float(value)
    units = ["o", "Ko", "Mo", "Go", "To"]

    for unit in units:
        if value < 1024 or unit == units[-1]:
            if unit == "o":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024


def list_playlist_files(playlist_id):
    data = read_playlist_config()
    playlist = data.get("playlists", {}).get(playlist_id)

    if not playlist:
        return None, "Playlist inconnue"

    output_dir = Path(playlist.get("output_dir", ""))

    if not output_dir.exists():
        return {
            "playlist_id": playlist_id,
            "output_dir": str(output_dir),
            "files": [],
        }, ""

    files = []

    for path in sorted(output_dir.rglob("*")):
        if not path.is_file():
            continue

        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue

        rel = path.relative_to(output_dir).as_posix()
        label = path.stem

        if len(label) > 5 and label[:2].isdigit() and label[2:5] == " - ":
            label = label[5:]

        try:
            size = path.stat().st_size
        except OSError:
            size = 0

        files.append({
            "path": rel,
            "label": label,
            "filename": path.name,
            "size": size,
            "size_label": format_bytes(size),
        })

    return {
        "playlist_id": playlist_id,
        "output_dir": str(output_dir),
        "files": files,
    }, ""

