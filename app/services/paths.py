from pathlib import Path

# Racine du projet sur le Raspberry Pi
BASE_DIR = Path("/home/kxsbpi/reveil")

CONFIG_DIR = BASE_DIR / "config"
LOG_DIR = BASE_DIR / "logs"
STATE_DIR = BASE_DIR / "state"
DATA_DIR = BASE_DIR / "data"
MUSIC_ROOT = Path("/home/kxsbpi/music")
MUSIC_DIR = MUSIC_ROOT / "reveil"

SCRIPTS_DIR = BASE_DIR / "scripts"
ALARM_SCRIPTS_DIR = SCRIPTS_DIR / "alarm"
PLAYER_SCRIPTS_DIR = SCRIPTS_DIR / "player"
RADIO_SCRIPTS_DIR = SCRIPTS_DIR / "radio"
PLAYLIST_SCRIPTS_DIR = SCRIPTS_DIR / "playlist"
HARDWARE_SCRIPTS_DIR = SCRIPTS_DIR / "hardware"

REVEIL_FILE = CONFIG_DIR / "reveil.conf"
SETTINGS_FILE = CONFIG_DIR / "reveil_settings.conf"
RADIO_STATIONS_FILE = CONFIG_DIR / "radio_stations.json"
PLAYLISTS_FILE = CONFIG_DIR / "playlists.json"
ALARM_PRESETS_FILE = CONFIG_DIR / "alarm_presets.json"

WEB_LOG_FILE = LOG_DIR / "web.log"
STATE_FILE = STATE_DIR / "player_state.json"

WAVEFORM_FILE = STATE_DIR / "audio_waveform.json"
WAVEFORM_PID_FILE = STATE_DIR / "audio_waveform.pid"
WAVEFORM_MANAGER_PID_FILE = STATE_DIR / "audio_waveform_manager.pid"
MPV_PID_FILE = STATE_DIR / "mpv.pid"
MPV_SOCKET_FILE = Path("/tmp/mpv_socket")

PLAY_SCRIPT = PLAYER_SCRIPTS_DIR / "play_reveil.sh"
PLAY_URL_SCRIPT = PLAYER_SCRIPTS_DIR / "play_url.sh"
PLAY_FILE_SCRIPT = PLAYER_SCRIPTS_DIR / "play_file.sh"
UPDATE_SCRIPT = PLAYLIST_SCRIPTS_DIR / "update_playlist.sh"
RADIO_META_SCRIPT = RADIO_SCRIPTS_DIR / "radio_meta.py"
SYNC_PLAYLIST_SCRIPT = PLAYLIST_SCRIPTS_DIR / "sync_playlist.py"


def ensure_runtime_dirs():
    """
    Crée les dossiers nécessaires à l'exécution web.
    Idempotent : peut être appelé plusieurs fois sans risque.
    """
    for directory in (CONFIG_DIR, LOG_DIR, STATE_DIR, DATA_DIR):
        directory.mkdir(parents=True, exist_ok=True)
