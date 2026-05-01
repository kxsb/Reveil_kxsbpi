import json
import re
import time

from services.paths import RADIO_STATIONS_FILE, RADIO_META_SCRIPT


RADIO_NOW_CACHE = {}
RADIO_NOW_TTL_OK = 15
RADIO_NOW_TTL_ERROR = 30


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


def fetch_radio_now(station_id, timeout=3):
    """
    Récupère les métadonnées live d'une radio via scripts/radio_meta.py.

    Cache léger en mémoire :
    - succès : 15 s ;
    - erreur : 30 s.

    Objectif : éviter de relancer un subprocess Python et une requête réseau
    à chaque polling frontend, surtout quand une API radio est lente ou HS.
    """
    import subprocess

    safe_station_id = sanitize_station_id(station_id)

    if not safe_station_id:
        return {
            "ok": False,
            "error": "Station invalide",
        }

    now = time.time()
    cached = RADIO_NOW_CACHE.get(safe_station_id)

    if cached:
        data = cached.get("data", {})
        ttl = RADIO_NOW_TTL_OK if data.get("ok") else RADIO_NOW_TTL_ERROR
        age = now - float(cached.get("ts", 0))

        if age < ttl:
            out = dict(data)
            out["cached"] = True
            out["cache_age"] = round(age, 1)
            return out

    try:
        proc = subprocess.run(
            ["python3", str(RADIO_META_SCRIPT), safe_station_id],
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "radio_meta.py failed")

        data = json.loads(proc.stdout)

        if not isinstance(data, dict):
            raise RuntimeError("radio_meta.py returned non-object JSON")

    except Exception as e:
        data = {
            "ok": False,
            "error": str(e),
        }

    RADIO_NOW_CACHE[safe_station_id] = {
        "ts": now,
        "data": data,
    }

    return data

