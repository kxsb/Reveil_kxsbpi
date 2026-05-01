import json
import re
from pathlib import Path

from services.paths import ALARM_PRESETS_FILE, SETTINGS_FILE
from services.alarm_service import write_alarm


PRESET_ID_RE = re.compile(r"^[a-z0-9_-]{2,50}$")

ALLOWED_SETTING_KEYS = {
    "ENABLE_FADE",
    "INITIAL_VOLUME",
    "MAX_VOLUME",
    "FADE_DURATION",
    "FADE_CURVE",
}

DEFAULT_PRESETS = {
    "presets": {
        "reveil_doux": {
            "label": "Réveil doux",
            "time": "07:30",
            "mode": "random",
            "settings": {
                "ENABLE_FADE": "1",
                "INITIAL_VOLUME": "5",
                "MAX_VOLUME": "60",
                "FADE_DURATION": "180",
                "FADE_CURVE": "ease_out",
            },
        },
        "reveil_progressif": {
            "label": "Progressif",
            "time": "07:30",
            "mode": "playlist",
            "settings": {
                "ENABLE_FADE": "1",
                "INITIAL_VOLUME": "5",
                "MAX_VOLUME": "80",
                "FADE_DURATION": "300",
                "FADE_CURVE": "ease_in_out",
            },
        },
        "reveil_direct": {
            "label": "Direct",
            "time": "07:30",
            "mode": "playlist",
            "settings": {
                "ENABLE_FADE": "0",
                "INITIAL_VOLUME": "30",
                "MAX_VOLUME": "80",
                "FADE_DURATION": "30",
                "FADE_CURVE": "linear",
            },
        },
    }
}


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def slugify(value):
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")

    if not value:
        value = "preset"

    return value[:50]


def read_presets_config():
    if not ALARM_PRESETS_FILE.exists():
        return DEFAULT_PRESETS

    try:
        data = json.loads(ALARM_PRESETS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_PRESETS

    if not isinstance(data, dict):
        return DEFAULT_PRESETS

    presets = data.get("presets")

    if not isinstance(presets, dict):
        data["presets"] = {}

    # On garde toujours les presets par défaut disponibles.
    for preset_id, preset in DEFAULT_PRESETS["presets"].items():
        data["presets"].setdefault(preset_id, preset)

    return data


def save_presets_config(data):
    atomic_write_json(ALARM_PRESETS_FILE, data)


def list_alarm_presets():
    data = read_presets_config()
    out = []

    for preset_id, preset in sorted(data.get("presets", {}).items()):
        item = dict(preset)
        item["id"] = preset_id
        out.append(item)

    return out


def sanitize_settings(settings):
    clean = {}

    for key, value in (settings or {}).items():
        if key not in ALLOWED_SETTING_KEYS:
            continue

        clean[key] = str(value).strip()

    clean.setdefault("ENABLE_FADE", "1")
    clean.setdefault("INITIAL_VOLUME", "5")
    clean.setdefault("MAX_VOLUME", "80")
    clean.setdefault("FADE_DURATION", "120")
    clean.setdefault("FADE_CURVE", "ease_out")

    return clean


def write_settings(settings):
    settings = sanitize_settings(settings)

    lines = [
        f"{key}={settings[key]}"
        for key in [
            "ENABLE_FADE",
            "INITIAL_VOLUME",
            "MAX_VOLUME",
            "FADE_DURATION",
            "FADE_CURVE",
        ]
    ]

    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_FILE.with_name(f".{SETTINGS_FILE.name}.tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(SETTINGS_FILE)


def add_alarm_preset(label, time_value, mode, settings):
    label = (label or "").strip()

    if not label:
        return None, "Nom du modèle manquant"

    preset_id = slugify(label)

    data = read_presets_config()
    presets = data.setdefault("presets", {})

    # Évite d'écraser silencieusement un preset existant.
    base_id = preset_id
    index = 2
    while preset_id in presets:
        preset_id = f"{base_id}_{index}"
        index += 1

    presets[preset_id] = {
        "label": label,
        "time": (time_value or "07:30").strip(),
        "mode": (mode or "random").strip(),
        "settings": sanitize_settings(settings),
    }

    save_presets_config(data)

    item = dict(presets[preset_id])
    item["id"] = preset_id

    return item, ""


def apply_alarm_preset(preset_id):
    data = read_presets_config()
    preset = data.get("presets", {}).get(preset_id)

    if not preset:
        return False, "Modèle introuvable"

    time_value = preset.get("time", "07:30")
    mode = preset.get("mode", "random")
    settings = sanitize_settings(preset.get("settings", {}))

    ok = write_alarm(time_value, mode)

    if not ok:
        return False, "Impossible d’appliquer l’heure/source"

    write_settings(settings)

    return True, "Réveil type appliqué"
