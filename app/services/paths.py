from pathlib import Path

# Racine du projet sur le Raspberry Pi
BASE_DIR = Path("/home/kxsbpi/reveil")

CONFIG_DIR = BASE_DIR / "config"
LOG_DIR = BASE_DIR / "logs"
SCRIPTS_DIR = BASE_DIR / "scripts"
STATE_DIR = BASE_DIR / "state"
DATA_DIR = BASE_DIR / "data"

REVEIL_FILE = CONFIG_DIR / "reveil.conf"
SETTINGS_FILE = CONFIG_DIR / "reveil_settings.conf"
RADIO_STATIONS_FILE = CONFIG_DIR / "radio_stations.json"

WEB_LOG_FILE = LOG_DIR / "web.log"
STATE_FILE = STATE_DIR / "player_state.json"

PLAY_SCRIPT = SCRIPTS_DIR / "play_reveil.sh"
TEST_SCRIPT = SCRIPTS_DIR / "reveil_test.sh"
UPDATE_SCRIPT = SCRIPTS_DIR / "update_playlist.sh"


def ensure_runtime_dirs():
    """
    Crée les dossiers nécessaires à l'exécution web.
    Idempotent : peut être appelé plusieurs fois sans risque.
    """
    for directory in (CONFIG_DIR, LOG_DIR, STATE_DIR, DATA_DIR):
        directory.mkdir(parents=True, exist_ok=True)
