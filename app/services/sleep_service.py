import re
from datetime import datetime, timedelta

from services.paths import SLEEP_FILE


TIME_RE = re.compile(r"^[0-9]{2}:[0-9]{2}$")
SOURCE_RE = re.compile(r"^[a-zA-Z0-9_:-]+$")

DEFAULT_SLEEP = {
    "time": "23:00",
    "source": "random",
    "fade_enabled": "1",
    "duration": "900",
    "curve": "ease_out",
}

ALLOWED_CURVES = {"linear", "ease_in", "ease_out", "ease_in_out"}
ALLOWED_DURATIONS = {"300", "900", "1800"}  # 5, 15, 30 min


def read_sleep_config():
    if not SLEEP_FILE.exists():
        return dict(DEFAULT_SLEEP)

    raw = SLEEP_FILE.read_text(encoding="utf-8").strip()
    parts = raw.split()

    if len(parts) < 5:
        return dict(DEFAULT_SLEEP)

    time_value, source, fade_enabled, duration, curve = parts[:5]

    if not TIME_RE.match(time_value):
        time_value = DEFAULT_SLEEP["time"]

    if not SOURCE_RE.match(source):
        source = DEFAULT_SLEEP["source"]

    fade_enabled = "1" if fade_enabled == "1" else "0"

    if duration not in ALLOWED_DURATIONS:
        duration = DEFAULT_SLEEP["duration"]

    if curve not in ALLOWED_CURVES:
        curve = DEFAULT_SLEEP["curve"]

    return {
        "time": time_value,
        "source": source,
        "fade_enabled": fade_enabled,
        "duration": duration,
        "curve": curve,
    }


def write_sleep_config(time_value, source, fade_enabled, duration, curve):
    time_value = (time_value or "").strip()
    source = (source or "random").strip()
    fade_enabled = "1" if str(fade_enabled).strip() == "1" else "0"
    duration = str(duration or DEFAULT_SLEEP["duration"]).strip()
    curve = (curve or DEFAULT_SLEEP["curve"]).strip()

    if not TIME_RE.match(time_value):
        return False, "Heure anti-veille invalide"

    if not SOURCE_RE.match(source):
        return False, "Source anti-veille invalide"

    if duration not in ALLOWED_DURATIONS:
        duration = DEFAULT_SLEEP["duration"]

    if curve not in ALLOWED_CURVES:
        curve = DEFAULT_SLEEP["curve"]

    SLEEP_FILE.parent.mkdir(parents=True, exist_ok=True)

    tmp = SLEEP_FILE.with_name(f".{SLEEP_FILE.name}.tmp")
    tmp.write_text(
        f"{time_value} {source} {fade_enabled} {duration} {curve}\n",
        encoding="utf-8",
    )
    tmp.replace(SLEEP_FILE)

    return True, "Anti-veille programmée"


def seconds_to_minutes_label(seconds):
    minutes = int(int(seconds) / 60)
    return f"{minutes} min"


def next_sleep_in_label(time_value):
    now = datetime.now()
    hour, minute = map(int, time_value.split(":"))

    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if target <= now:
        target += timedelta(days=1)

    delta = target - now
    total_minutes = max(0, int(delta.total_seconds() // 60))

    hours = total_minutes // 60
    minutes = total_minutes % 60

    if hours and minutes:
        return f"Dans {hours} h {minutes} min"

    if hours:
        return f"Dans {hours} h"

    return f"Dans {minutes} min"


def sleep_status():
    data = read_sleep_config()

    return {
        "ok": True,
        "sleep_time": data["time"],
        "sleep_source": data["source"],
        "fade_enabled": data["fade_enabled"],
        "duration": data["duration"],
        "duration_label": seconds_to_minutes_label(data["duration"]),
        "curve": data["curve"],
        "time_until": next_sleep_in_label(data["time"]),
    }
