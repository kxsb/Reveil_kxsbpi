import json
import re

from services.paths import RADIO_STATIONS_FILE


def sanitize_station_id(station_id):
    """
    Nettoie un identifiant station pour éviter toute injection dans les routes/commandes.
    """
    return re.sub(r"[^a-zA-Z0-9_-]", "", station_id or "")


def read_radio_stations():
    """
    Lit la configuration des stations radio.

    Retourne un dictionnaire vide si le fichier est absent ou invalide.
    """
    try:
        if not RADIO_STATIONS_FILE.exists():
            return {}

        data = json.loads(RADIO_STATIONS_FILE.read_text(encoding="utf-8"))

        if not isinstance(data, dict):
            return {}

        return data

    except Exception:
        return {}


def get_radio_station(station_id):
    """
    Retourne (safe_station_id, station_data) ou (safe_station_id, None).
    """
    safe_station_id = sanitize_station_id(station_id)

    if not safe_station_id:
        return "", None

    stations = read_radio_stations()
    station = stations.get(safe_station_id)

    return safe_station_id, station


def get_radio_label(station_id):
    safe_station_id, station = get_radio_station(station_id)

    if not station:
        return safe_station_id or "Radio"

    return station.get("label", safe_station_id)


def fetch_radio_now(station_id, timeout=5):
    """
    Récupère les métadonnées live d'une radio via scripts/radio_meta.py.

    Retourne toujours un dictionnaire JSON-compatible.
    """
    import json
    import subprocess

    from services.paths import SCRIPTS_DIR

    safe_station_id = sanitize_station_id(station_id)

    if not safe_station_id:
        return {
            "ok": False,
            "error": "Station invalide",
        }

    try:
        proc = subprocess.run(
            ["python3", str(SCRIPTS_DIR / "radio_meta.py"), safe_station_id],
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "radio_meta.py failed")

        return json.loads(proc.stdout)

    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
        }
