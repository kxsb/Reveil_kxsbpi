#!/usr/bin/env python3

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def kill_process(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except Exception:
        pass


def read_mpv_property(socket_path: str, prop: str):
    payload = json.dumps({"command": ["get_property", prop]}).encode("utf-8") + b"\n"

    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(0.7)
        client.connect(socket_path)
        client.sendall(payload)

        data = b""
        while not data.endswith(b"\n"):
            chunk = client.recv(4096)
            if not chunk:
                break
            data += chunk

    if not data:
        return None

    response = json.loads(data.decode("utf-8", errors="replace"))
    return response.get("data")


def main():
    if len(sys.argv) < 4:
        print(
            "Usage: audio_waveform_source_watcher.py <mpv_socket> <waveform_json> <waveform_pid_file>",
            file=sys.stderr,
        )
        raise SystemExit(2)

    socket_path = sys.argv[1]
    waveform_file = Path(sys.argv[2])
    waveform_pid_file = Path(sys.argv[3])
    monitor_script = Path(__file__).with_name("audio_waveform_monitor.py")

    current_source = None
    monitor_proc = None

    def stop_monitor():
        nonlocal monitor_proc

        if monitor_proc and monitor_proc.poll() is None:
            kill_process(monitor_proc.pid)

        monitor_proc = None

        try:
            waveform_pid_file.unlink()
        except FileNotFoundError:
            pass

    def start_monitor(source: str):
        nonlocal monitor_proc, current_source

        stop_monitor()

        monitor_proc = subprocess.Popen(
            ["python3", str(monitor_script), source, str(waveform_file)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        waveform_pid_file.parent.mkdir(parents=True, exist_ok=True)
        waveform_pid_file.write_text(str(monitor_proc.pid), encoding="utf-8")
        current_source = source

    try:
        atomic_write_json(waveform_file, {
            "ok": False,
            "active": False,
            "level": 0,
            "bars": [],
        })

        while True:
            if not os.path.exists(socket_path):
                time.sleep(0.4)
                continue

            try:
                source = read_mpv_property(socket_path, "path")
            except Exception:
                time.sleep(0.4)
                continue

            if source and source != current_source:
                start_monitor(str(source))

            time.sleep(0.5)

    finally:
        stop_monitor()
        atomic_write_json(waveform_file, {
            "ok": False,
            "active": False,
            "level": 0,
            "bars": [],
        })


if __name__ == "__main__":
    main()
