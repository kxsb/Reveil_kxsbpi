from flask import Flask, request, redirect, render_template, jsonify
import subprocess
from datetime import datetime, timedelta
import re
import json
import time

app = Flask(__name__, template_folder="templates", static_folder="static")

from services.paths import (
    BASE_DIR,
    REVEIL_FILE,
    SETTINGS_FILE,
    WEB_LOG_FILE as LOG_FILE,
    SCRIPTS_DIR,
    PLAY_SCRIPT,
    TEST_SCRIPT,
    UPDATE_SCRIPT,
    STATE_FILE,
    RADIO_STATIONS_FILE,
    ensure_runtime_dirs,
)

ensure_runtime_dirs()

ALLOWED_MODES = ["playlist", "radio", "random", "fip"]

TIME_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")

def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line)

def read_alarm():
    try:
        if not REVEIL_FILE.exists():
            return "non réglé"
        return REVEIL_FILE.read_text(encoding="utf-8").strip() or "non réglé"
    except Exception as e:
        log(f"Erreur lecture réveil : {e}")
        return "non réglé"

def write_alarm(time_value, mode):
    if not TIME_RE.match(time_value):
        log(f"Heure invalide refusée : {time_value}")
        return False

    if mode not in ALLOWED_MODES:
        log(f"Mode invalide remplacé par random : {mode}")
        mode = "random"

    REVEIL_FILE.parent.mkdir(parents=True, exist_ok=True)
    REVEIL_FILE.write_text(f"{time_value} {mode}\n", encoding="utf-8")
    log(f"Réveil réglé : {time_value} {mode}")
    return True

def read_settings():
    defaults = {
        "ENABLE_FADE": "1",
        "INITIAL_VOLUME": "10",
        "MAX_VOLUME": "80",
        "FADE_DURATION": "120",
        "FADE_CURVE": "linear",
    }

    if not SETTINGS_FILE.exists():
        return defaults

    settings = defaults.copy()

    for line in SETTINGS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key in settings:
            settings[key] = value

    return settings

def read_radio_stations():
    try:
        if not RADIO_STATIONS_FILE.exists():
            return {}

        data = json.loads(RADIO_STATIONS_FILE.read_text(encoding="utf-8"))

        if not isinstance(data, dict):
            return {}

        return data

    except Exception as e:
        log(f"Erreur lecture radio_stations : {e}")
        return {}

def write_settings(settings):
    content = "\n".join([
        f'ENABLE_FADE={settings["ENABLE_FADE"]}',
        f'INITIAL_VOLUME={settings["INITIAL_VOLUME"]}',
        f'MAX_VOLUME={settings["MAX_VOLUME"]}',
        f'FADE_DURATION={settings["FADE_DURATION"]}',
        f'FADE_CURVE={settings["FADE_CURVE"]}',
        "",
    ])

    SETTINGS_FILE.write_text(content, encoding="utf-8")
    log(f"Paramètres réveil mis à jour : {settings}")

def parse_alarm():
    raw = read_alarm()
    parts = raw.split()

    if len(parts) >= 2 and TIME_RE.match(parts[0]):
        mode = parts[1] if parts[1] in ALLOWED_MODES else "random"
        return parts[0], mode

    if TIME_RE.match(raw):
        return raw, "random"

    return "", "random"

def next_alarm_label():
    alarm_time, alarm_mode = parse_alarm()

    if not TIME_RE.match(alarm_time):
        return "Aucun réveil programmé"

    now = datetime.now()
    hour, minute = map(int, alarm_time.split(":"))

    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if target <= now:
        target += timedelta(days=1)

    delta = target - now
    total_minutes = int(delta.total_seconds() // 60)

    hours = total_minutes // 60
    minutes = total_minutes % 60

    if hours == 0:
        return f"Dans {minutes} min"

    if minutes == 0:
        return f"Dans {hours} h"

    return f"Dans {hours} h {minutes} min"

def run_process(args):
    log(f"Commande lancée : {' '.join(str(a) for a in args)}")

    with LOG_FILE.open("a", encoding="utf-8") as log_handle:
        process = subprocess.Popen(
            [str(a) for a in args],
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=log_handle,
            start_new_session=True,
        )

    log(f"PID lancé : {process.pid}")

def is_mpv_running():
    result = subprocess.run(
        ["/usr/bin/pgrep", "-x", "mpv"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0

@app.route("/")
def index():
    alarm_time, alarm_mode = parse_alarm()
    settings = read_settings()

    return render_template(
        "index.html",
        current=read_alarm(),
        alarm_time=alarm_time,
        alarm_mode=alarm_mode,
        settings=settings,
        next_alarm=next_alarm_label(),
    )

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

@app.route("/set", methods=["POST"])
def set_alarm():
    time_value = request.form.get("time", "").strip()
    mode = request.form.get("mode", "random").strip()

    if not TIME_RE.match(time_value):
        log(f"Heure invalide refusée : {time_value}")
        return redirect("/")

    if mode not in ALLOWED_MODES:
        mode = "random"

    write_alarm(time_value, mode)
    return redirect("/")


@app.route("/test", methods=["POST"])
def test_sound():
    run_process(["/bin/bash", TEST_SCRIPT])
    return jsonify({"ok": True, "message": "🎧 Test sonore lancé"})

@app.route("/play_playlist", methods=["POST"])
def play_playlist():
    run_process(["/bin/bash", PLAY_SCRIPT])
    return jsonify({"ok": True, "message": "▶️ Playlist lancée"})

@app.route("/play_radio/<station_id>", methods=["POST"])
def play_radio(station_id):
    safe_station_id = re.sub(r"[^a-zA-Z0-9_-]", "", station_id)

    if not safe_station_id:
        return jsonify({"ok": False, "message": "Station invalide"})

    stations = read_radio_stations()

    if safe_station_id not in stations:
        return jsonify({"ok": False, "message": "Station inconnue"})

    run_process(["/bin/bash", PLAY_SCRIPT, "radio", safe_station_id])

    settings = read_settings()
    label = stations[safe_station_id].get("label", safe_station_id)
    message = f"📻 Radio lancée : {label}"

    if settings.get("ENABLE_FADE") == "1":
        message += " avec fade-in"

    return jsonify({"ok": True, "message": message})


@app.route("/play_fip", methods=["POST"])
def play_fip():
    return play_radio("fip")


@app.route("/stop", methods=["POST"])
def stop():
    try:
        subprocess.run(
            ["/usr/bin/pkill", "-x", "mpv"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )

        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text('{"status":"stopped"}', encoding="utf-8")

        log("Lecture arrêtée via bouton stop")
    except Exception as e:
        log(f"Erreur stop : {e}")

    return jsonify({"ok": True, "message": "🛑 Lecture arrêtée"})


@app.route("/update_playlist", methods=["POST"])
def update_playlist():
    run_process(["/bin/bash", UPDATE_SCRIPT])
    return jsonify({"ok": True, "message": "🔄 Mise à jour playlist lancée"})

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

    return jsonify({
        "ok": True,
        "settings": settings
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
    if not STATE_FILE.exists():
        return jsonify({
            "status": "idle",
            "now": int(time.time())
        })

    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        data = {"status": "unknown"}

    if data.get("status") in ["playing", "fading"] and not is_mpv_running():
        data = {"status": "stopped"}
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(data), encoding="utf-8")
        log("État player corrigé : mpv absent, passage à stopped")

    data["now"] = int(time.time())
    return jsonify(data)

@app.route("/radio_now/<station_id>")
def radio_now(station_id):
    safe_station_id = re.sub(r"[^a-zA-Z0-9_-]", "", station_id)

    if not safe_station_id:
        return jsonify({"ok": False, "error": "Station invalide"})

    try:
        proc = subprocess.run(
            ["python3", str(SCRIPTS_DIR / "radio_meta.py"), safe_station_id],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if proc.returncode != 0:
            raise Exception(proc.stderr)

        data = json.loads(proc.stdout)
        return jsonify(data)

    except Exception as e:
        log(f"Erreur radio_now : {e}")
        return jsonify({
            "ok": False,
            "error": str(e),
        })

@app.route("/radio_stations")
def radio_stations():
    return jsonify({
        "ok": True,
        "stations": read_radio_stations(),
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)