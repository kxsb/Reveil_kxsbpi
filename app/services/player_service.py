import json
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

from services.paths import BASE_DIR, WEB_LOG_FILE, STATE_FILE, WAVEFORM_FILE, WAVEFORM_PID_FILE, WAVEFORM_MANAGER_PID_FILE, MPV_PID_FILE, MPV_SOCKET_FILE


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


def atomic_write_json(path, data):
    """
    Écrit un JSON de manière atomique :
    - écriture dans un fichier temporaire ;
    - remplacement final par rename atomique.

    Ça évite que Flask lise un JSON partiellement écrit.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp")
    tmp_path.write_text(
        json.dumps(data, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def read_pid_file(pid_file):
    try:
        if not pid_file.exists():
            return None

        raw = pid_file.read_text(encoding="utf-8").strip()
        if not raw:
            return None

        return int(raw)
    except Exception as e:
        log(f"PID invalide dans {pid_file} : {e}")
        return None


def process_cmdline(pid):
    try:
        return Path(f"/proc/{pid}/cmdline").read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def is_expected_process(pid, expected):
    cmdline = process_cmdline(pid)
    return bool(cmdline and expected in cmdline)


def is_process_alive(pid):
    return Path(f"/proc/{pid}").exists()


def is_mpv_running():
    pid = read_pid_file(MPV_PID_FILE)

    if pid is None:
        return False

    return is_process_alive(pid) and is_expected_process(pid, "mpv")


def send_mpv_quit():
    if not MPV_SOCKET_FILE.exists():
        return False

    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            sock.connect(str(MPV_SOCKET_FILE))
            sock.sendall(b'{"command":["quit"]}\n')
        return True
    except Exception as e:
        log(f"Impossible d'envoyer quit via socket mpv : {e}")
        return False


def wait_process_exit(pid, timeout=2.0):
    deadline = time.time() + timeout

    while time.time() < deadline:
        if not is_process_alive(pid):
            return True
        time.sleep(0.1)

    return not is_process_alive(pid)


def cleanup_mpv_pid_file():
    try:
        MPV_PID_FILE.unlink()
    except FileNotFoundError:
        pass
    except Exception as e:
        log(f"Erreur suppression MPV_PID_FILE : {e}")



def stop_waveform_monitor():
    for pid_file in (WAVEFORM_MANAGER_PID_FILE, WAVEFORM_PID_FILE):
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text(encoding="utf-8").strip())
                subprocess.run(
                    ["/bin/kill", str(pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
            except Exception as e:
                log(f"Erreur arrêt waveform process : {e}")

            try:
                pid_file.unlink()
            except FileNotFoundError:
                pass

    atomic_write_json(WAVEFORM_FILE, {
        "ok": False,
        "active": False,
        "level": 0,
        "bars": [],
    })

def stop_mpv():
    """
    Stoppe uniquement le mpv lancé par l'application.

    Ordre :
    1. lecture de state/mpv.pid ;
    2. vérification que le PID correspond bien à mpv ;
    3. tentative d'arrêt propre via socket IPC ;
    4. fallback kill PID ;
    5. nettoyage waveform + état.
    """
    pid = read_pid_file(MPV_PID_FILE)

    if pid is None:
        log("Stop demandé : aucun MPV_PID_FILE, aucun mpv ciblé")
    elif not is_expected_process(pid, "mpv"):
        log(f"Stop demandé : PID {pid} ignoré, ce n'est pas un processus mpv attendu")
        cleanup_mpv_pid_file()
    else:
        log(f"Stop ciblé mpv PID={pid}")

        stopped = False

        if send_mpv_quit():
            stopped = wait_process_exit(pid, timeout=2.0)

        if not stopped and is_process_alive(pid):
            subprocess.run(
                ["/bin/kill", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            stopped = wait_process_exit(pid, timeout=2.0)

        if not stopped and is_process_alive(pid):
            subprocess.run(
                ["/bin/kill", "-9", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            wait_process_exit(pid, timeout=1.0)

        cleanup_mpv_pid_file()

    stop_waveform_monitor()
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
    atomic_write_json(STATE_FILE, data)


def read_waveform_state():
    if not WAVEFORM_FILE.exists():
        return {
            "ok": False,
            "active": False,
            "level": 0,
            "bars": [],
        }

    try:
        data = json.loads(WAVEFORM_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {
            "ok": False,
            "active": False,
            "level": 0,
            "bars": [],
        }

    # Si le fichier est vieux, on considère la waveform inactive.
    if time.time() - float(data.get("ts", 0)) > 3:
        data["active"] = False

    return data
