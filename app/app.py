from flask import Flask, request, redirect, render_template, jsonify
import subprocess
from pathlib import Path
from datetime import datetime
import re
import json
import time

app = Flask(__name__, template_folder="templates", static_folder="static")

HOME = Path("/home/kxsbpi/reveil")

REVEIL_FILE = HOME / "config/reveil.conf"
SETTINGS_FILE = HOME / "config/reveil_settings.conf"
LOG_FILE = HOME / "logs/web.log"
SCRIPTS_DIR = HOME / "scripts"
PLAY_SCRIPT = SCRIPTS_DIR / "play_reveil.sh"
TEST_SCRIPT = SCRIPTS_DIR / "reveil_test.sh"

STATE_FILE = HOME / "state/player_state.json"

UPDATE_SCRIPT = SCRIPTS_DIR / "update_playlist.sh"

ALLOWED_MODES = ["playlist", "fip", "random"]

def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    LOG_FILE.open("a", encoding="utf-8").write(line)


def read_alarm():
    if not REVEIL_FILE.exists():
        return "non réglé"
    return REVEIL_FILE.read_text(encoding="utf-8").strip() or "non réglé"


def write_alarm(time_value, mode):
    REVEIL_FILE.write_text(f"{time_value} {mode}\n", encoding="utf-8")
    log(f"Réveil réglé : {time_value} {mode}")

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

    if len(parts) >= 2:
        return parts[0], parts[1]

    if re.match(r"^[0-2][0-9]:[0-5][0-9]$", raw):
        return raw, "random"

    return "", "random"

def next_alarm_label():
    alarm_time, alarm_mode = parse_alarm()

    if not re.match(r"^[0-2][0-9]:[0-5][0-9]$", alarm_time):
        return "Aucun réveil programmé"

    now = datetime.now()
    hour, minute = map(int, alarm_time.split(":"))

    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if target <= now:
        target = target.replace(day=target.day + 1)

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
            cwd=str(HOME),
            stdout=log_handle,
            stderr=log_handle,
            start_new_session=True,
        )

    log(f"PID lancé : {process.pid}")

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

    if not re.match(r"^[0-2][0-9]:[0-5][0-9]$", time_value):
        return jsonify({"ok": False})

    if mode not in ALLOWED_MODES:
        mode = "random"

    write_alarm(time_value, mode)

    return jsonify({
        "ok": True,
        "value": f"{time_value} {mode}"
    })

@app.route("/set", methods=["POST"])
def set_alarm():
    time_value = request.form.get("time", "").strip()
    mode = request.form.get("mode", "random").strip()

    if not re.match(r"^[0-2][0-9]:[0-5][0-9]$", time_value):
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



@app.route("/play_fip", methods=["POST"])
def play_fip():
    run_process([
        "/usr/bin/mpv",
        "--no-video",
        "--audio-device=alsa/plughw:CARD=Pro,DEV=0",
        "https://icecast.radiofrance.fr/fip-midfi.mp3",
    ])
    return jsonify({"ok": True, "message": "📻 FIP lancé"})



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

    data["now"] = int(time.time())
    return jsonify(data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)