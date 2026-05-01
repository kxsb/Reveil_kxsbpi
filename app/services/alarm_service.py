import re
from datetime import datetime, timedelta

from services.paths import REVEIL_FILE, WEB_LOG_FILE

ALLOWED_SIMPLE_MODES = ["playlist", "random", "fip"]
TIME_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
STATION_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _log(msg):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n"
    WEB_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with WEB_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line)


def read_alarm():
    try:
        if not REVEIL_FILE.exists():
            return "non réglé"
        return REVEIL_FILE.read_text(encoding="utf-8").strip() or "non réglé"
    except Exception as e:
        _log(f"Erreur lecture réveil : {e}")
        return "non réglé"


def _normalize_alarm_source(mode):
    """
    Convertit la valeur venant de l'interface en format fichier.

    UI:
      random
      playlist
      radio:fip
      radio:pulsar

    Fichier:
      HH:MM random
      HH:MM playlist
      HH:MM radio fip
    """
    mode = (mode or "").strip()

    if mode in ALLOWED_SIMPLE_MODES:
        if mode == "fip":
            return "radio", "fip"
        return mode, ""

    if mode.startswith("radio:"):
        station_id = mode.split(":", 1)[1].strip()

        if STATION_RE.match(station_id):
            return "radio", station_id

        _log(f"Station radio invalide refusée : {station_id}")
        return "random", ""

    _log(f"Mode invalide remplacé par random : {mode}")
    return "random", ""


def write_alarm(time_value, mode):
    if not TIME_RE.match(time_value):
        _log(f"Heure invalide refusée : {time_value}")
        return False

    normalized_mode, station_id = _normalize_alarm_source(mode)

    REVEIL_FILE.parent.mkdir(parents=True, exist_ok=True)

    if normalized_mode == "radio":
        REVEIL_FILE.write_text(f"{time_value} radio {station_id}\n", encoding="utf-8")
        _log(f"Réveil réglé : {time_value} radio {station_id}")
    else:
        REVEIL_FILE.write_text(f"{time_value} {normalized_mode}\n", encoding="utf-8")
        _log(f"Réveil réglé : {time_value} {normalized_mode}")

    return True


def parse_alarm():
    raw = read_alarm()
    parts = raw.split()

    if len(parts) >= 3 and TIME_RE.match(parts[0]) and parts[1] == "radio":
        station_id = parts[2] if STATION_RE.match(parts[2]) else "fip"
        return parts[0], f"radio:{station_id}"

    if len(parts) >= 2 and TIME_RE.match(parts[0]):
        mode = parts[1]

        if mode == "fip":
            return parts[0], "radio:fip"

        if mode in ALLOWED_SIMPLE_MODES:
            return parts[0], mode

    if TIME_RE.match(raw):
        return raw, "random"

    return "", "random"


def next_alarm_label():
    alarm_time, _alarm_mode = parse_alarm()

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
