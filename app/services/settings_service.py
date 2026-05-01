from services.paths import SETTINGS_FILE

DEFAULT_SETTINGS = {
    "ENABLE_FADE": "1",
    "INITIAL_VOLUME": "10",
    "MAX_VOLUME": "80",
    "FADE_DURATION": "120",
    "FADE_CURVE": "linear",
}


def read_settings():
    """
    Lit les paramètres du réveil progressif depuis reveil_settings.conf.

    Retourne toujours un dictionnaire complet avec des valeurs par défaut
    si le fichier est absent ou incomplet.
    """
    if not SETTINGS_FILE.exists():
        return DEFAULT_SETTINGS.copy()

    settings = DEFAULT_SETTINGS.copy()

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
    """
    Écrit les paramètres du réveil progressif dans reveil_settings.conf.
    """
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)

    content = "\n".join([
        f'ENABLE_FADE={settings["ENABLE_FADE"]}',
        f'INITIAL_VOLUME={settings["INITIAL_VOLUME"]}',
        f'MAX_VOLUME={settings["MAX_VOLUME"]}',
        f'FADE_DURATION={settings["FADE_DURATION"]}',
        f'FADE_CURVE={settings["FADE_CURVE"]}',
        "",
    ])

    SETTINGS_FILE.write_text(content, encoding="utf-8")
