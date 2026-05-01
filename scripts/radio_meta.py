#!/usr/bin/env python3
import json
import sys
import urllib.request
from pathlib import Path

BASE = Path("/home/kxsbpi/reveil")
STATIONS_FILE = BASE / "config/radio_stations.json"


def load_stations():
    with STATIONS_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def radiofrance_livemeta(station_id, station):
    meta_station_id = station.get("meta_station_id")
    url = f"https://api.radiofrance.fr/livemeta/pull/{meta_station_id}"

    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.load(r)

    level = data["levels"][0]
    uid = level["items"][level["position"]]
    step = data["steps"][uid]

    return {
        "ok": True,
        "station_id": station_id,
        "station_label": station.get("label", station_id),
        "title": step.get("title", ""),
        "artist": step.get("authors", ""),
        "album": step.get("titreAlbum", ""),
        "year": step.get("anneeEditionMusique", ""),
        "visual": step.get("visual", ""),
    }

def icy_meta(station_id, station):
    stream_url = station.get("stream_url")

    if not stream_url:
        return empty_meta(station_id, station)

    try:
        import subprocess

        script_path = Path(__file__).parent / "radio_meta_icy.py"

        proc = subprocess.run(
            ["python3", str(script_path), stream_url],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if proc.returncode != 0:
            return empty_meta(station_id, station)

        data = json.loads(proc.stdout)

        if not data.get("ok"):
            return empty_meta(station_id, station)

        return {
            "ok": True,
            "station_id": station_id,
            "station_label": station.get("label", station_id),
            "title": data.get("title", ""),
            "artist": data.get("artist", ""),
            "album": "",
            "year": "",
            "visual": "",
        }

    except Exception:
        return empty_meta(station_id, station)
        
def nts_meta(station_id, station):
    channel = "1" if station_id == "nts_1" else "2"
    url = f"https://api.ntslive.net/v2/live/{channel}"

    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.load(r)

    now = data.get("now", {})
    title = now.get("broadcast_title") or ""
    artist = now.get("embeds", [{}])[0].get("details", "") if now.get("embeds") else ""

    embeds = now.get("embeds") or []
    if embeds:
        artist = embeds[0].get("details", "") or ""

    return {
        "ok": True,
        "station_id": station_id,
        "station_label": station.get("label", station_id),
        "title": title,
        "artist": artist,
        "album": "",
        "year": "",
        "visual": "",
    }


def nova_meta(station_id, station):
    url = "https://www.nova.fr/radio/endpoint/currentTrack/"

    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.load(r)

    return {
        "ok": True,
        "station_id": station_id,
        "station_label": station.get("label", station_id),
        "title": data.get("title", ""),
        "artist": data.get("artist", ""),
        "album": "",
        "year": "",
        "visual": "",
    }


def empty_meta(station_id, station):
    return {
        "ok": True,
        "station_id": station_id,
        "station_label": station.get("label", station_id),
        "title": "",
        "artist": "",
        "album": "",
        "year": "",
        "visual": "",
    }


def main():
    station_id = sys.argv[1] if len(sys.argv) > 1 else "fip"

    try:
        stations = load_stations()

        if station_id not in stations:
            raise ValueError(f"Station inconnue : {station_id}")

        station = stations[station_id]
        meta_type = station.get("meta_type")

        if meta_type == "radiofrance_livemeta":
            result = radiofrance_livemeta(station_id, station)
        elif meta_type == "nts":
            result = nts_meta(station_id, station)
        elif meta_type == "nova":
            result = nova_meta(station_id, station)
        elif meta_type == "icy":
            result = icy_meta(station_id, station)
        else:
            result = empty_meta(station_id, station)

    except Exception as e:
        result = {
            "ok": False,
            "station_id": station_id,
            "error": str(e),
        }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()