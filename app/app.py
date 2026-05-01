from flask import Flask, request, redirect, render_template, jsonify
from urllib.parse import urlparse
from pathlib import Path

app = Flask(__name__, template_folder="templates", static_folder="static")

from services.paths import (
    BASE_DIR,
    REVEIL_FILE,
    SETTINGS_FILE,
    WEB_LOG_FILE as LOG_FILE,
    SCRIPTS_DIR,
    PLAY_SCRIPT,
    PLAY_URL_SCRIPT,
    PLAY_FILE_SCRIPT,
    SLEEP_TIMER_SCRIPT,
    UPDATE_SCRIPT,
    SYNC_PLAYLIST_SCRIPT,
    MUSIC_DIR,
    MUSIC_ROOT,
    STATE_FILE,
    RADIO_STATIONS_FILE,
    ensure_runtime_dirs,
)

ensure_runtime_dirs()

from services.settings_service import read_settings, write_settings
from services.alarm_service import (
    read_alarm,
    write_alarm,
    parse_alarm,
    next_alarm_label,
)
from services.radio_service import (
    read_radio_stations,
    get_radio_station,
    sanitize_station_id,
    fetch_radio_now,
)
from services.player_service import (
    log,
    run_process,
    stop_mpv,
    read_player_state,
    read_waveform_state,
)

from services.sleep_service import (
    sleep_status as get_sleep_status,
    write_sleep_config,
)
from services.system_service import system_overview as get_system_overview
from services.alarm_preset_service import (
    list_alarm_presets,
    add_alarm_preset,
    apply_alarm_preset,
)
from services.playlist_service import (
    list_playlists,
    add_or_update_playlist,
    list_playlist_files,
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/alarm")
def alarm_page():
    alarm_time, alarm_mode = parse_alarm()
    settings = read_settings()

    return render_template(
        "alarm.html",
        current=read_alarm(),
        alarm_time=alarm_time,
        alarm_mode=alarm_mode,
        settings=settings,
        next_alarm=next_alarm_label(),
    )


@app.route("/radio")
def radio_page():
    return render_template("radio.html")


@app.route("/config")
def config_page():
    return render_template("config.html")


@app.route("/player")
def player_page():
    return render_template("player.html")


@app.route("/sleep_status")
def sleep_status():
    return jsonify(get_sleep_status())


@app.route("/sleep")
def sleep_page():
    return render_template("sleep.html")


@app.route("/set_ajax", methods=["POST"])
def set_alarm_ajax():
    time_value = request.form.get("time", "").strip()
    mode = request.form.get("mode", "random").strip()

    if not write_alarm(time_value, mode):
        return jsonify({"ok": False})

    return jsonify({
        "ok": True,
        "value": f"{time_value} {mode}",
        "next_alarm": next_alarm_label(),
    })


@app.route("/test", methods=["POST"])
def test_sound():
    """
    Teste la source sélectionnée dans le module Réveil.

    Valeurs attendues côté UI :
    - random
    - playlist
    - random:<playlist_id>
    - playlist:<playlist_id>
    - radio:<station_id>
    """
    raw_mode = request.form.get("mode", "").strip() or "random"

    play_mode = "random"
    source_id = "reveil"

    if raw_mode in ["random", "playlist"]:
        play_mode = raw_mode
        source_id = "reveil"

    elif raw_mode == "fip":
        # Compat legacy.
        play_mode = "radio"
        source_id = "fip"

    elif ":" in raw_mode:
        kind, value = raw_mode.split(":", 1)
        kind = kind.strip()
        value = value.strip()

        if kind in ["random", "playlist", "radio"] and value:
            play_mode = kind
            source_id = value
        else:
            return jsonify({
                "ok": False,
                "message": "Source de test invalide",
            })

    try:
        stop_mpv()
    except Exception as e:
        log(f"Erreur stop avant test son : {e}")

    run_process(["/bin/bash", PLAY_SCRIPT, play_mode, source_id, "test"])

    return jsonify({
        "ok": True,
        "message": "🎧 Test sonore lancé",
    })


@app.route("/play_playlist", methods=["POST"])
def play_playlist():
    run_process(["/bin/bash", PLAY_SCRIPT])
    return jsonify({"ok": True, "message": "▶️ Playlist lancée"})

@app.route("/play_radio/<station_id>", methods=["POST"])
def play_radio(station_id):
    safe_station_id, station = get_radio_station(station_id)

    if not safe_station_id:
        return jsonify({"ok": False, "message": "Station invalide"})

    if not station:
        return jsonify({"ok": False, "message": "Station inconnue"})

    run_process(["/bin/bash", PLAY_SCRIPT, "radio", safe_station_id, "manual"])

    label = station.get("label", safe_station_id)
    message = f"📻 Radio lancée : {label}"

    return jsonify({"ok": True, "message": message})




AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".oga", ".wav", ".flac", ".webm"}


def safe_music_file(rel_path):
    """
    Valide un chemin relatif audio.

    Priorité :
    - chemin relatif depuis MUSIC_ROOT, ex: playlists/test/son.webm ;
    - fallback legacy depuis MUSIC_DIR, ex: 01 - morceau.webm.

    Refuse :
    - chemins absolus ;
    - traversal ../ ;
    - extensions non audio ;
    - fichiers inexistants.
    """
    rel_path = (rel_path or "").strip()

    if not rel_path:
        return None, "Fichier manquant"

    rel = Path(rel_path)

    if rel.is_absolute() or ".." in rel.parts:
        return None, "Chemin invalide"

    roots = [MUSIC_ROOT, MUSIC_DIR]

    for root in roots:
        root = root.resolve()
        candidate = (root / rel).resolve()

        try:
            candidate.relative_to(root)
        except ValueError:
            continue

        if candidate.suffix.lower() not in AUDIO_EXTENSIONS:
            continue

        if candidate.is_file():
            return candidate, ""

    return None, "Fichier introuvable"

@app.route("/music_browser")
def music_browser():
    rel_path = request.args.get("path", "").strip()
    rel = Path(rel_path)

    if rel.is_absolute() or ".." in rel.parts:
        return jsonify({
            "ok": False,
            "message": "Chemin invalide",
        })

    root = MUSIC_ROOT.resolve()
    current = (root / rel).resolve()

    try:
        current.relative_to(root)
    except ValueError:
        return jsonify({
            "ok": False,
            "message": "Chemin hors dossier musique",
        })

    if not current.exists() or not current.is_dir():
        return jsonify({
            "ok": False,
            "message": "Dossier introuvable",
        })

    dirs = []
    files = []

    for path in sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if path.name.startswith("."):
            continue

        item_rel = path.relative_to(root).as_posix()

        if path.is_dir():
            dirs.append({
                "type": "folder",
                "path": item_rel,
                "label": path.name,
            })
            continue

        if not path.is_file():
            continue

        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue

        label = path.stem

        if len(label) > 5 and label[:2].isdigit() and label[2:5] == " - ":
            label = label[5:]

        try:
            size = path.stat().st_size
        except OSError:
            size = 0

        files.append({
            "type": "file",
            "path": item_rel,
            "label": label,
            "filename": path.name,
            "size": size,
        })

    parent = ""
    if rel_path:
        parent_path = rel.parent.as_posix()
        parent = "" if parent_path == "." else parent_path

    return jsonify({
        "ok": True,
        "path": "" if rel_path in ["", "."] else rel.as_posix(),
        "parent": parent,
        "dirs": dirs,
        "files": files,
    })


@app.route("/music_files")
def music_files():
    if not MUSIC_DIR.exists():
        return jsonify({
            "ok": True,
            "files": [],
            "message": "Dossier musique absent",
        })

    files = []

    for path in sorted(MUSIC_DIR.rglob("*")):
        if not path.is_file():
            continue

        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue

        rel = path.relative_to(MUSIC_DIR).as_posix()
        label = path.stem

        # Nettoyage léger des préfixes playlist type "01 - "
        if len(label) > 5 and label[:2].isdigit() and label[2:5] == " - ":
            label = label[5:]

        files.append({
            "path": rel,
            "label": label,
            "filename": path.name,
        })

    return jsonify({
        "ok": True,
        "files": files,
    })


@app.route("/play_file", methods=["POST"])
def play_file():
    rel_path = request.form.get("path", "").strip()
    file_path, error = safe_music_file(rel_path)

    if error:
        return jsonify({
            "ok": False,
            "message": error,
        })

    try:
        stop_mpv()
    except Exception as e:
        log(f"Erreur stop avant lecture fichier : {e}")

    run_process(["/bin/bash", PLAY_FILE_SCRIPT, rel_path])

    return jsonify({
        "ok": True,
        "message": "🎧 Lecture locale lancée",
    })


@app.route("/play_url", methods=["POST"])
def play_url():
    url = request.form.get("url", "").strip()

    if not url:
        return jsonify({"ok": False, "message": "URL manquante"})

    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()

    allowed_hosts = {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
    }

    if parsed.scheme not in ["http", "https"] or host not in allowed_hosts:
        return jsonify({
            "ok": False,
            "message": "URL YouTube invalide",
        })

    try:
        stop_mpv()
    except Exception as e:
        log(f"Erreur stop avant lecture URL : {e}")

    run_process(["/bin/bash", PLAY_URL_SCRIPT, url])

    return jsonify({
        "ok": True,
        "message": "🎧 Lecture YouTube lancée",
    })


@app.route("/sleep_start", methods=["POST"])
def sleep_start():
    time_value = request.form.get("time", "").strip()
    source = request.form.get("source", "random").strip()
    fade_enabled = request.form.get("fade_enabled", "1").strip()
    duration = request.form.get("duration", "900").strip()
    curve = request.form.get("fade_curve", "ease_out").strip()

    ok, message = write_sleep_config(
        time_value=time_value,
        source=source,
        fade_enabled=fade_enabled,
        duration=duration,
        curve=curve,
    )

    return jsonify({
        "ok": ok,
        "message": "🌙 " + message if ok else message,
    })


@app.route("/stop", methods=["POST"])
def stop():
    try:
        stop_mpv()
    except Exception as e:
        log(f"Erreur stop : {e}")

    return jsonify({"ok": True, "message": "⏹ Lecture arrêtée"})



@app.route("/settings_ajax", methods=["POST"])
def settings_ajax():
    settings = read_settings()

    enable_fade = request.form.get("enable_fade")
    initial_volume = request.form.get("initial_volume")
    fade_duration = request.form.get("fade_duration")
    fade_curve = request.form.get("fade_curve")

    if enable_fade in ["0", "1"]:
        settings["ENABLE_FADE"] = enable_fade

    if initial_volume in ["5", "10", "20", "30"]:
        settings["INITIAL_VOLUME"] = initial_volume

    if fade_duration in ["30", "60", "120", "300"]:
        settings["FADE_DURATION"] = fade_duration

    if fade_curve in ["linear", "ease_in", "ease_out", "ease_in_out"]:
        settings["FADE_CURVE"] = fade_curve

    settings["MAX_VOLUME"] = "80"

    write_settings(settings)
    log(f"Paramètres réveil mis à jour : {settings}")

    return jsonify({
        "ok": True,
        "settings": settings
    })

@app.route("/alarm_presets")
def alarm_presets():
    return jsonify({
        "ok": True,
        "presets": list_alarm_presets(),
    })


@app.route("/alarm_presets", methods=["POST"])
def save_alarm_preset():
    label = request.form.get("label", "").strip()
    time_value = request.form.get("time", "").strip()
    mode = request.form.get("mode", "").strip()

    settings = {
        "ENABLE_FADE": request.form.get("ENABLE_FADE", "1"),
        "INITIAL_VOLUME": request.form.get("INITIAL_VOLUME", "5"),
        "MAX_VOLUME": request.form.get("MAX_VOLUME", "80"),
        "FADE_DURATION": request.form.get("FADE_DURATION", "120"),
        "FADE_CURVE": request.form.get("FADE_CURVE", "ease_out"),
    }

    item, error = add_alarm_preset(label, time_value, mode, settings)

    if error:
        return jsonify({
            "ok": False,
            "message": error,
        })

    return jsonify({
        "ok": True,
        "preset": item,
        "message": "Modèle enregistré",
    })


@app.route("/apply_alarm_preset/<preset_id>", methods=["POST"])
def apply_alarm_preset_route(preset_id):
    ok, message = apply_alarm_preset(preset_id)

    return jsonify({
        "ok": ok,
        "message": message,
    })


@app.route("/alarm_status")
def alarm_status():
    alarm_time, alarm_mode = parse_alarm()

    return jsonify({
        "ok": True,
        "current": read_alarm(),
        "alarm_time": alarm_time,
        "alarm_mode": alarm_mode,
        "next_alarm": next_alarm_label(),
    })

@app.route("/status")
def status():
    return jsonify(read_player_state())


@app.route("/radio_now/<station_id>")
def radio_now(station_id):
    data = fetch_radio_now(station_id)

    if not data.get("ok"):
        log(f"Erreur radio_now : {data.get('error')}")

    return jsonify(data)



@app.route("/playlists")
def playlists():
    return jsonify({
        "ok": True,
        "playlists": list_playlists(),
    })


@app.route("/playlists", methods=["POST"])
def save_playlist():
    playlist_id = request.form.get("playlist_id", "").strip()
    label = request.form.get("label", "").strip()
    url = request.form.get("url", "").strip()

    item, error = add_or_update_playlist(playlist_id, label, url)

    if error:
        return jsonify({
            "ok": False,
            "message": error,
        })

    return jsonify({
        "ok": True,
        "playlist": item,
        "message": "Playlist enregistrée",
    })


@app.route("/playlist_files/<playlist_id>")
def playlist_files(playlist_id):
    data, error = list_playlist_files(playlist_id)

    if error:
        return jsonify({
            "ok": False,
            "message": error,
        })

    return jsonify({
        "ok": True,
        **data,
    })


@app.route("/sync_playlist/<playlist_id>", methods=["POST"])
def sync_playlist(playlist_id):
    run_process(["python3", SYNC_PLAYLIST_SCRIPT, playlist_id])

    return jsonify({
        "ok": True,
        "message": "Synchronisation lancée",
    })


@app.route("/system_overview")
def system_overview():
    return jsonify(get_system_overview())


@app.route("/waveform")
def waveform():
    return jsonify(read_waveform_state())

@app.route("/radio_stations")
def radio_stations():
    return jsonify({
        "ok": True,
        "stations": read_radio_stations(),
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)