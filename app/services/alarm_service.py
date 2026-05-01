import re
from datetime import datetime, timedelta

from services.paths import REVEIL_FILE, WEB_LOG_FILE

ALLOWED_MODES = ["playlist", "radio", "random", "fip"]
TIME_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")


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


def write_alarm(time_value, mode):
    if not TIME_RE.match(time_value):
        _log(f"Heure invalide refusée : {time_value}")
        return False

    if mode not in ALLOWED_MODES:
        _log(f"Mode invalide remplacé par random : {mode}")
        mode = "random"

    REVEIL_FILE.parent.mkdir(parents=True, exist_ok=True)
    REVEIL_FILE.write_text(f"{time_value} {mode}\n", encoding="utf-8")

    _log(f"Réveil réglé : {time_value} {mode}")
    return True


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
