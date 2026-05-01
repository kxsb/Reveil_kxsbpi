import json
import subprocess
import time
from datetime import datetime

from services.paths import BASE_DIR, WEB_LOG_FILE, STATE_FILE


def log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    WEB_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with WEB_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line)


def run_process(args):
    """
    Lance un processus détaché depuis la racine du projet.
    Retourne le PID du processus lancé.
    """
    log(f"Commande lancée : {' '.join(str(a) for a in args)}")

    with WEB_LOG_FILE.open("a", encoding="utf-8") as log_handle:
        process = subprocess.Popen(
            [str(a) for a in args],
            cwd=str(BASE_DIR),
            stdout=log_handle,
            stderr=log_handle,
            start_new_session=True,
        )

    log(f"PID lancé : {process.pid}")
    return process.pid


def is_mpv_running():
    result = subprocess.run(
        ["/usr/bin/pgrep", "-x", "mpv"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def stop_mpv():
    """
    Stoppe tous les processus mpv.

    À remplacer plus tard par un stop ciblé par PID/socket.
    """
    subprocess.run(
        ["/usr/bin/pkill", "-x", "mpv"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )

    write_player_state({"status": "stopped"})
    log("Lecture arrêtée via bouton stop")


def read_player_state():
    if not STATE_FILE.exists():
        return {
            "status": "idle",
            "now": int(time.time()),
        }

    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        data = {"status": "unknown"}

    if data.get("status") in ["playing", "fading"] and not is_mpv_running():
        data = {"status": "stopped"}
        write_player_state(data)
        log("État player corrigé : mpv absent, passage à stopped")

    data["now"] = int(time.time())
    return data


def write_player_state(data):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(data), encoding="utf-8")
