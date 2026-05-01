#!/usr/bin/env python3

from signal import pause
import subprocess
from datetime import datetime
from pathlib import Path

from gpiozero import Button, Device
from gpiozero.pins.lgpio import LGPIOFactory

Device.pin_factory = LGPIOFactory(chip=0)

SOCKET = "/tmp/mpv_socket"
LOG = Path("/home/kxsbpi/buttons.log")
SNOOZE_SCRIPT = "/home/kxsbpi/scripts/snooze.sh"

def log(msg: str) -> None:
    with LOG.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now().strftime('%F %T')} {msg}\n")

def send_mpv(cmd: str, label: str) -> None:
    log(f"bouton {label}")
    try:
        subprocess.run(
            ["socat", "-", SOCKET],
            input=(cmd + "\n").encode(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        log(f"commande envoyée {label}")
    except Exception as e:
        log(f"erreur {label}: {e}")
def run_snooze() -> None:
    log("bouton snooze")
    try:
        subprocess.Popen(
            [SNOOZE_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        log("snooze lancé")
    except Exception as e:
        log(f"erreur snooze: {e}")

# Ajuste les GPIO si besoin
BTN_STOP = Button(27, pull_up=True, bounce_time=0.2)
BTN_SNOOZE = Button(17, pull_up=True, bounce_time=0.2)
BTN_VOL_UP = Button(22, pull_up=True, bounce_time=0.2)
BTN_VOL_DOWN = Button(23, pull_up=True, bounce_time=0.2)

# Rouge = arrêt complet du réveil
BTN_STOP.when_pressed = lambda: send_mpv('{ "command": ["quit"] }', "stop")

# Bleu = snooze
BTN_SNOOZE.when_pressed = run_snooze

# Vert / jaune = volume
BTN_VOL_UP.when_pressed = lambda: send_mpv('{ "command": ["add", "volume", 5] }', "vol+")
BTN_VOL_DOWN.when_pressed = lambda: send_mpv('{ "command": ["add", "volume", -5] }', "vol-")

log("service boutons démarré")
pause()
