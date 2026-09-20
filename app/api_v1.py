import json
import math
import socket

from flask import Blueprint, jsonify, request
from urllib.parse import urlparse

from services.paths import (
    PLAY_SCRIPT,
    PLAY_URL_SCRIPT,
    MPV_SOCKET_FILE,
)
from services.player_service import (
    read_player_state,
    read_waveform_state,
    run_process,
    send_mpv_command,
    stop_mpv,
    is_mpv_running,
    mark_manual_volume_override,
    clear_manual_volume_override,
)
from services.alarm_service import (
    read_alarm,
    write_alarm,
    parse_alarm,
    next_alarm_label,
)
from services.settings_service import (
    read_settings,
    write_settings,
)
from services.sleep_service import (
    sleep_status,
    write_sleep_config,
)
from services.radio_service import (
    read_radio_stations,
    get_radio_station,
    fetch_radio_now,
)
from services.playlist_service import (
    list_playlists,
    list_playlist_files,
)
from services.system_service import system_overview


api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")


# ---------------------------------------------------------------------------
# Réponses API
# ---------------------------------------------------------------------------

def ok(data=None, message=None, status=200):
    payload = {"ok": True}

    if data is not None:
        payload["data"] = data

    if message:
        payload["message"] = message

    return jsonify(payload), status


def error(code, message, status=400):
    return jsonify({
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }), status


def input_data():
    if request.is_json:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    return request.form.to_dict(flat=True)


# ---------------------------------------------------------------------------
# Etat runtime MPV
# ---------------------------------------------------------------------------

def mpv_properties(names):
    """
    Lit plusieurs propriétés MPV via une seule connexion IPC.

    Retourne un dictionnaire partiel :
    une propriété indisponible vaut None.
    """
    result = {name: None for name in names}

    if not is_mpv_running() or not MPV_SOCKET_FILE.exists():
        return result

    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(1.0)
            sock.connect(str(MPV_SOCKET_FILE))

            stream = sock.makefile("rwb", buffering=0)

            for index, name in enumerate(names, start=1):
                payload = {
                    "command": ["get_property", name],
                    "request_id": index,
                }

                stream.write(
                    (json.dumps(payload) + "\n").encode("utf-8")
                )

                while True:
                    raw = stream.readline()

                    if not raw:
                        break

                    response = json.loads(raw.decode("utf-8"))

                    if response.get("request_id") != index:
                        continue

                    if response.get("error") == "success":
                        result[name] = response.get("data")

                    break

    except Exception:
        pass

    return result


def player_runtime():
    if not is_mpv_running():
        return {
            "running": False,
            "ready": False,
            "paused": False,
            "media_title": None,
            "playlist_position": None,
            "playlist_index": None,
            "playlist_count": 0,
            "position_seconds": None,
            "duration_seconds": None,
            "volume": None,
        }

    props = mpv_properties([
        "pause",
        "media-title",
        "playlist-pos",
        "playlist-count",
        "time-pos",
        "duration",
        "volume",
    ])

    playlist_position = props.get("playlist-pos")

    playlist_index = None

    if isinstance(playlist_position, int):
        playlist_index = playlist_position + 1

    ready = (
        props.get("pause") is not None
        or props.get("playlist-count") is not None
        or props.get("media-title") is not None
    )

    return {
        "running": True,
        "ready": ready,
        "paused": bool(props.get("pause")),
        "media_title": props.get("media-title"),
        "playlist_position": playlist_position,
        "playlist_index": playlist_index,
        "playlist_count": props.get("playlist-count") or 0,
        "position_seconds": props.get("time-pos"),
        "duration_seconds": props.get("duration"),
        "volume": props.get("volume"),
    }


def public_playlist(item):
    """
    Contrat exposé au client.

    Ne publie volontairement ni output_dir ni loudness_file,
    qui sont des détails internes au Raspberry Pi.
    """
    return {
        "id": item.get("id"),
        "label": item.get("label", item.get("id", "")),
        "min_audio_files": item.get("min_audio_files", 0),
    }


# ---------------------------------------------------------------------------
# CORS limité aux clients locaux / Capacitor
# ---------------------------------------------------------------------------

def allowed_origin(origin):
    if not origin:
        return False

    fixed = {
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
    }

    if origin in fixed:
        return True

    return (
        origin.startswith("http://localhost:")
        or origin.startswith("https://localhost:")
    )


@api_v1.after_request
def api_cors(response):
    origin = request.headers.get("Origin", "")

    if allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"

    return response


# ---------------------------------------------------------------------------
# Helpers métier
# ---------------------------------------------------------------------------

def playlist_map():
    return {
        item.get("id"): item
        for item in list_playlists()
        if item.get("id")
    }


def valid_source(source):
    source = (source or "").strip()

    if source in {"random", "playlist"}:
        return True

    if ":" not in source:
        return False

    kind, source_id = source.split(":", 1)

    if not source_id:
        return False

    if kind == "radio":
        _, station = get_radio_station(source_id)
        return station is not None

    if kind in {"random", "playlist"}:
        return source_id in playlist_map()

    return False


def valid_youtube_url(url):
    try:
        parsed = urlparse((url or "").strip())
    except Exception:
        return False

    hosts = {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
    }

    return (
        parsed.scheme in {"http", "https"}
        and (parsed.netloc or "").lower() in hosts
    )


# ---------------------------------------------------------------------------
# API / santé
# ---------------------------------------------------------------------------

@api_v1.route("/health")
def api_health():
    return ok({
        "api_version": "v1",
        "service": "maison-sonore",
    })


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------

@api_v1.route("/player/status")
def api_player_status():
    state = dict(read_player_state())
    runtime = player_runtime()

    stored_status = state.get("status", "unknown")

    # MPV est la source de vérité pour l'état instantané.
    #
    # player_state.json contient surtout le contexte de lecture
    # (mode, source, démarrage, etc.) et peut avoir quelques
    # secondes de retard au lancement.
    if runtime["running"]:
        if not runtime["ready"]:
            effective_status = "starting"
        elif runtime["paused"]:
            effective_status = "paused"
        elif stored_status == "fading":
            effective_status = "fading"
        else:
            effective_status = "playing"
    else:
        if stored_status in {"playing", "fading", "paused"}:
            effective_status = "stopped"
        else:
            effective_status = stored_status

    state["status"] = effective_status
    state["runtime"] = runtime

    return ok(state)


@api_v1.route("/player/waveform")
def api_player_waveform():
    return ok(read_waveform_state())


@api_v1.route("/player/youtube", methods=["POST"])
def api_player_youtube():
    data = input_data()
    url = str(data.get("url", "")).strip()

    if not valid_youtube_url(url):
        return error(
            "invalid_youtube_url",
            "URL YouTube invalide",
            400,
        )

    try:
        stop_mpv()
    except Exception:
        pass

    run_process([
        "/bin/bash",
        PLAY_URL_SCRIPT,
        url,
    ])

    return ok(message="Lecture YouTube lancée")


@api_v1.route("/player/radio", methods=["POST"])
def api_player_radio():
    data = input_data()
    station_id = str(data.get("station_id", "")).strip()

    safe_station_id, station = get_radio_station(station_id)

    if not safe_station_id:
        return error(
            "invalid_station",
            "Identifiant de station invalide",
            400,
        )

    if not station:
        return error(
            "unknown_station",
            "Station inconnue",
            404,
        )

    try:
        stop_mpv()
    except Exception:
        pass

    run_process([
        "/bin/bash",
        PLAY_SCRIPT,
        "radio",
        safe_station_id,
        "manual",
    ])

    return ok(
        {
            "station_id": safe_station_id,
            "label": station.get("label", safe_station_id),
        },
        "Radio lancée",
    )


@api_v1.route("/player/playlist", methods=["POST"])
def api_player_playlist():
    data = input_data()

    playlist_id = str(data.get("playlist_id", "reveil")).strip()
    mode = str(data.get("mode", "playlist")).strip()
    start_file = str(data.get("start_file", "")).strip()

    playlists = playlist_map()

    if playlist_id not in playlists:
        return error(
            "unknown_playlist",
            "Playlist inconnue",
            404,
        )

    if mode not in {"playlist", "random"}:
        return error(
            "invalid_playlist_mode",
            "Le mode doit être playlist ou random",
            400,
        )

    if start_file:
        result, file_error = list_playlist_files(playlist_id)

        if file_error or not result:
            return error(
                "playlist_unavailable",
                "Impossible de lire la playlist",
                500,
            )

        allowed_files = {
            item.get("path")
            for item in result.get("files", [])
            if item.get("path")
        }

        if start_file not in allowed_files:
            return error(
                "unknown_track",
                "Morceau inconnu dans cette playlist",
                404,
            )

    try:
        stop_mpv()
    except Exception:
        pass

    command = [
        "/bin/bash",
        PLAY_SCRIPT,
        mode,
        playlist_id,
        "manual",
    ]

    if start_file:
        command.append(start_file)

    run_process(command)

    return ok({
        "playlist_id": playlist_id,
        "mode": mode,
        "start_file": start_file or None,
    }, "Playlist lancée")


PLAYER_COMMANDS = {
    "pause": ["cycle", "pause"],
    "next": ["playlist-next", "force"],
    "previous": ["playlist-prev", "force"],
}


def player_command(name):
    command = PLAYER_COMMANDS[name]

    if not send_mpv_command(command):
        return error(
            "player_unavailable",
            "Lecteur indisponible",
            409,
        )

    return ok({"command": name})


@api_v1.route("/player/pause", methods=["POST"])
def api_player_pause():
    return player_command("pause")


@api_v1.route("/player/next", methods=["POST"])
def api_player_next():
    return player_command("next")


@api_v1.route("/player/previous", methods=["POST"])
def api_player_previous():
    return player_command("previous")


@api_v1.route("/player/stop", methods=["POST"])
def api_player_stop():
    stop_mpv()
    return ok(message="Lecture arrêtée")


@api_v1.route("/player/volume", methods=["POST"])
def api_player_volume():
    data = input_data()

    if not is_mpv_running():
        return error(
            "player_unavailable",
            "Lecteur indisponible",
            409,
        )

    runtime = player_runtime()
    current = runtime.get("volume")

    if current is None:
        return error(
            "player_not_ready",
            "Volume du lecteur indisponible",
            409,
        )

    try:
        if "value" in data:
            target = float(data.get("value"))

        elif "delta" in data:
            delta = float(data.get("delta"))

            if abs(delta) > 25:
                raise ValueError("delta trop grand")

            target = float(current) + delta

        else:
            raise ValueError("volume absent")

        if not math.isfinite(target):
            raise ValueError("volume non fini")

    except (TypeError, ValueError):
        return error(
            "invalid_volume",
            "Volume invalide",
            400,
        )

    target = max(0.0, min(100.0, target))

    override_pid = mark_manual_volume_override()

    if override_pid is None:
        return error(
            "player_unavailable",
            "Lecteur indisponible",
            409,
        )

    if not send_mpv_command([
        "set_property",
        "volume",
        target,
    ]):
        clear_manual_volume_override(
            expected_pid=override_pid
        )

        return error(
            "player_unavailable",
            "Impossible de modifier le volume",
            409,
        )

    return ok({
        "volume": round(target, 1),
        "automatic_curve_cancelled": True,
    })

# ---------------------------------------------------------------------------
# Radios
# ---------------------------------------------------------------------------

@api_v1.route("/radios")
def api_radios():
    return ok({
        "stations": read_radio_stations(),
    })


@api_v1.route("/radios/<station_id>/now")
def api_radio_now(station_id):
    safe_station_id, station = get_radio_station(station_id)

    if not safe_station_id or not station:
        return error(
            "unknown_station",
            "Station inconnue",
            404,
        )

    try:
        metadata = fetch_radio_now(safe_station_id)
    except Exception:
        metadata = {}

    return ok({
        "station_id": safe_station_id,
        "metadata": metadata or {},
    })


# ---------------------------------------------------------------------------
# Playlists
# ---------------------------------------------------------------------------

@api_v1.route("/playlists")
def api_playlists():
    return ok({
        "playlists": [
            public_playlist(item)
            for item in list_playlists()
        ],
    })


@api_v1.route("/playlists/<playlist_id>/files")
def api_playlist_files(playlist_id):
    result, file_error = list_playlist_files(playlist_id)

    if file_error:
        return error(
            "unknown_playlist",
            file_error,
            404,
        )

    return ok({
        "playlist_id": result.get("playlist_id"),
        "files": result.get("files", []),
    })


# ---------------------------------------------------------------------------
# Réveil
# ---------------------------------------------------------------------------

def public_alarm_settings():
    settings = read_settings()

    def safe_int(key, fallback):
        try:
            return int(settings.get(key, fallback))
        except (TypeError, ValueError):
            return fallback

    curve = settings.get("FADE_CURVE", "linear")

    if curve not in {
        "linear",
        "ease_in",
        "ease_out",
        "ease_in_out",
    }:
        curve = "linear"

    return {
        "fade_enabled":
            settings.get("ENABLE_FADE", "1") == "1",
        "initial_volume":
            safe_int("INITIAL_VOLUME", 10),
        "max_volume":
            safe_int("MAX_VOLUME", 80),
        "fade_duration":
            safe_int("FADE_DURATION", 120),
        "fade_curve":
            curve,
    }


def normalize_alarm_settings(raw):
    if not isinstance(raw, dict):
        return None, "Paramètres de fondu invalides"

    current = read_settings()

    enabled_raw = raw.get(
        "fade_enabled",
        current.get("ENABLE_FADE", "1"),
    )

    if isinstance(enabled_raw, bool):
        enabled = "1" if enabled_raw else "0"
    else:
        normalized = str(enabled_raw).strip().lower()

        if normalized in {"1", "true", "yes", "on"}:
            enabled = "1"
        elif normalized in {"0", "false", "no", "off"}:
            enabled = "0"
        else:
            return None, "Activation du fondu invalide"

    try:
        initial = int(
            raw.get(
                "initial_volume",
                current.get("INITIAL_VOLUME", "10"),
            )
        )

        duration = int(
            raw.get(
                "fade_duration",
                current.get("FADE_DURATION", "120"),
            )
        )
    except (TypeError, ValueError):
        return None, "Paramètres numériques invalides"

    curve = str(
        raw.get(
            "fade_curve",
            current.get("FADE_CURVE", "linear"),
        )
    ).strip()

    if initial not in {10, 20, 30}:
        return None, "Volume initial invalide"

    if duration not in {60, 120, 300}:
        return None, "Durée du fondu invalide"

    if curve not in {
        "linear",
        "ease_in",
        "ease_out",
        "ease_in_out",
    }:
        return None, "Courbe de fondu invalide"

    return {
        "ENABLE_FADE": enabled,
        "INITIAL_VOLUME": str(initial),
        "MAX_VOLUME": "80",
        "FADE_DURATION": str(duration),
        "FADE_CURVE": curve,
    }, None


@api_v1.route("/alarm")
def api_alarm_get():
    alarm_time, alarm_mode = parse_alarm()

    return ok({
        "raw": read_alarm(),
        "time": alarm_time,
        "mode": alarm_mode,
        "next_alarm": next_alarm_label(),
        "settings": public_alarm_settings(),
    })


@api_v1.route("/alarm", methods=["PUT"])
def api_alarm_put():
    data = input_data()

    time_value = str(data.get("time", "")).strip()
    mode = str(data.get("mode", "")).strip()

    if not valid_source(mode):
        return error(
            "invalid_alarm_source",
            "Source de réveil invalide",
            400,
        )

    settings_to_write = None

    if "settings" in data:
        settings_to_write, settings_error = (
            normalize_alarm_settings(data.get("settings"))
        )

        if settings_error:
            return error(
                "invalid_alarm_settings",
                settings_error,
                400,
            )

    if not write_alarm(time_value, mode):
        return error(
            "invalid_alarm",
            "Configuration du réveil invalide",
            400,
        )

    if settings_to_write is not None:
        try:
            write_settings(settings_to_write)
        except Exception:
            return error(
                "alarm_settings_write_failed",
                "Impossible d'enregistrer les paramètres du réveil",
                500,
            )

    alarm_time, alarm_mode = parse_alarm()

    return ok({
        "time": alarm_time,
        "mode": alarm_mode,
        "next_alarm": next_alarm_label(),
        "settings": public_alarm_settings(),
    }, "Réveil enregistré")


# ---------------------------------------------------------------------------
# Anti-veille
# ---------------------------------------------------------------------------

@api_v1.route("/sleep")
def api_sleep_get():
    data = dict(sleep_status())
    data.pop("ok", None)
    return ok(data)


@api_v1.route("/sleep", methods=["PUT"])
def api_sleep_put():
    current = sleep_status()
    data = input_data()

    time_value = str(
        data.get("time", current.get("sleep_time", "23:00"))
    ).strip()

    source = str(
        data.get("source", current.get("sleep_source", "random"))
    ).strip()

    fade_enabled = str(
        data.get("fade_enabled", current.get("fade_enabled", "1"))
    ).strip()

    duration = str(
        data.get("duration", current.get("duration", "900"))
    ).strip()

    curve = str(
        data.get("curve", current.get("curve", "ease_out"))
    ).strip()

    if not valid_source(source):
        return error(
            "invalid_sleep_source",
            "Source anti-veille invalide",
            400,
        )

    success, message = write_sleep_config(
        time_value=time_value,
        source=source,
        fade_enabled=fade_enabled,
        duration=duration,
        curve=curve,
    )

    if not success:
        return error(
            "invalid_sleep_config",
            message,
            400,
        )

    result = dict(sleep_status())
    result.pop("ok", None)

    return ok(
        result,
        message,
    )


# ---------------------------------------------------------------------------
# Système
# ---------------------------------------------------------------------------

@api_v1.route("/system")
def api_system():
    data = dict(system_overview())
    data.pop("ok", None)
    return ok(data)
