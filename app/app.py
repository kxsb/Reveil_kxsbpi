from flask import Flask, request, redirect, render_template, jsonify

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
)


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
    safe_station_id, station = get_radio_station(station_id)

    if not safe_station_id:
        return jsonify({"ok": False, "message": "Station invalide"})

    if not station:
        return jsonify({"ok": False, "message": "Station inconnue"})

    run_process(["/bin/bash", PLAY_SCRIPT, "radio", safe_station_id])

    settings = read_settings()
    label = station.get("label", safe_station_id)
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
        stop_mpv()
    except Exception as e:
        log(f"Erreur stop : {e}")

    return jsonify({"ok": True, "message": "⏹ Lecture arrêtée"})


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
    log(f"Paramètres réveil mis à jour : {settings}")

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
    return jsonify(read_player_state())


@app.route("/radio_now/<station_id>")
def radio_now(station_id):
    data = fetch_radio_now(station_id)

    if not data.get("ok"):
        log(f"Erreur radio_now : {data.get('error')}")

    return jsonify(data)


@app.route("/radio_stations")
def radio_stations():
    return jsonify({
        "ok": True,
        "stations": read_radio_stations(),
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)