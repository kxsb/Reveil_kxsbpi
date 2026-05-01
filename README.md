# Réveil Raspberry Pi – V2

Interface locale de réveil, radio et lecteur audio pour Raspberry Pi, conçue comme une petite console web mobile-first. La V2 marque le passage d’un simple réveil audio vers une architecture en sous-applications : **Réveil**, **Radio**, puis plus tard **Lecteur YouTube audio**, **Lumière** et **Configuration Pi**.

Le projet est pensé pour tourner en local sur un Raspberry Pi relié à une sortie audio de qualité, avec lecture via `mpv`, interface web Flask, déclenchement automatique via `cron`, fade-in configurable, playlist YouTube synchronisée en local, normalisation loudness et waveform audio dynamique.

---

## Sommaire

1. [Concept](#concept)
2. [Fonctionnalités principales](#fonctionnalités-principales)
3. [Architecture V2](#architecture-v2)
4. [Sous-applications](#sous-applications)
5. [Flux audio et logique de lecture](#flux-audio-et-logique-de-lecture)
6. [Waveform dynamique](#waveform-dynamique)
7. [Installation](#installation)
8. [Configuration](#configuration)
9. [Lancement de l’interface](#lancement-de-linterface)
10. [Cron : réveil et mise à jour playlist](#cron--réveil-et-mise-à-jour-playlist)
11. [Commandes utiles](#commandes-utiles)
12. [API locale Flask](#api-locale-flask)
13. [Logs et fichiers d’état](#logs-et-fichiers-détat)
14. [Dépannage](#dépannage)
15. [Roadmap](#roadmap)

---

## Concept

Ce projet transforme un Raspberry Pi en **station audio locale** pilotable depuis un téléphone ou un navigateur sur le réseau local.

La philosophie V2 :

- une page d’accueil simple sous forme de **hub d’applications** ;
- une sous-app **Réveil** pour programmer l’heure, la source et le fade-in ;
- une sous-app **Radio** pour écouter une station manuellement, sans fade-in ;
- une logique audio commune centralisée autour de `mpv` ;
- une waveform visuelle élégante, basée sur le niveau réel du flux en cours ;
- une architecture de dossiers lisible par domaine fonctionnel.

Le projet reste volontairement simple : pas de base de données, pas de cloud, pas d’authentification, pas de dépendance lourde. Il est conçu pour tourner sur un réseau domestique local.

---

## Fonctionnalités principales

### Réveil programmable

- Heure de réveil configurable depuis l’interface web.
- Source de réveil configurable :
  - playlist locale ;
  - mode aléatoire ;
  - radio sélectionnée parmi les stations configurées.
- Déclenchement automatique via `cron`, toutes les minutes.
- Verrou anti-double déclenchement sur la même minute.

### Réveil progressif

- Fade-in activable/désactivable.
- Volume initial configurable.
- Volume maximum actuellement fixé à 80% côté interface.
- Durée de montée configurable : 1 min, 2 min, 5 min.
- Courbes de montée :
  - linéaire ;
  - ease-in ;
  - ease-out ;
  - ease-in-out.

### Radio manuelle

- Page radio dédiée.
- Liste de stations chargée depuis `config/radio_stations.json`.
- Lecture manuelle sans fade-in.
- Métadonnées live quand elles sont disponibles : FIP, NTS, ICY, etc.
- Bouton Stop affiché seulement quand une lecture est active.

### Playlist locale

- Synchronisation depuis une playlist YouTube avec `yt-dlp`.
- Téléchargement dans un dossier temporaire.
- Remplacement du miroir local après téléchargement réussi.
- Analyse loudness avec `ffmpeg`.
- Lecture ordonnée ou mélangée.

### Waveform dynamique

- La waveform est pilotée par le flux réellement joué par `mpv`.
- Un watcher lit la source courante via le socket IPC de `mpv`.
- Un monitor `ffmpeg` calcule un niveau RMS léger.
- L’interface web dessine une onde fluide en Canvas, modulée par le niveau réel.
- La waveform apparaît aussi sur l’icône de la sous-app active dans le hub.

---

## Architecture V2

```text
reveil/
├── app/
│   ├── app.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── alarm_service.py
│   │   ├── paths.py
│   │   ├── player_service.py
│   │   ├── radio_service.py
│   │   └── settings_service.py
│   ├── static/
│   │   ├── app.js
│   │   └── style.css
│   └── templates/
│       ├── alarm.html
│       ├── index.html
│       └── radio.html
│
├── config/
│   ├── radio_stations.json
│   ├── reveil.conf
│   └── reveil_settings.conf
│
├── data/
│   └── loudness_index.json
│
├── logs/
│   ├── alarm.log
│   ├── cron.log
│   ├── player.log
│   ├── update.log
│   └── web.log
│
├── scripts/
│   ├── alarm/
│   │   └── alarm_tick.sh
│   ├── hardware/
│   │   └── buttons_control.py
│   ├── player/
│   │   ├── audio_waveform_monitor.py
│   │   ├── audio_waveform_source_watcher.py
│   │   └── play_reveil.sh
│   ├── playlist/
│   │   ├── analyze_loudness.py
│   │   └── update_playlist.sh
│   └── radio/
│       ├── radio_meta.py
│       └── radio_meta_icy.py
│
├── state/
│   ├── audio_waveform.json
│   ├── audio_waveform.pid
│   ├── audio_waveform_manager.pid
│   └── player_state.json
│
└── README.md
```

### Principe de rangement

- `app/` contient l’application Flask, l’interface web et les services Python côté web.
- `scripts/alarm/` contient la logique cron de déclenchement du réveil.
- `scripts/player/` contient le moteur audio principal et la waveform.
- `scripts/radio/` contient la récupération des métadonnées radio.
- `scripts/playlist/` contient la synchronisation YouTube et l’analyse loudness.
- `scripts/hardware/` contient les futurs contrôles physiques GPIO.
- `config/` contient les fichiers modifiables à l’exécution.
- `state/` contient l’état temporaire courant.
- `logs/` contient les journaux d’exécution.

---

## Sous-applications

### Hub principal `/`

La page d’accueil est une grille de sous-applications :

- Réveil ;
- Radio ;
- Lumière, à venir ;
- Lecteur, à venir ;
- Config Pi, à venir.

Quand une lecture est active, la tuile correspondante est marquée visuellement et affiche une waveform dans son icône.

### Réveil `/alarm`

La page Réveil est volontairement minimale :

- encart principal avec heure du prochain réveil ;
- badge de source ;
- délai avant déclenchement ;
- clic sur l’encart pour modifier heure et source ;
- panneau de paramètres du fade-in ;
- bouton de test sonore dans les paramètres ;
- bouton Stop uniquement si une lecture est active.

La logique du test sonore utilise le moteur principal avec le contexte `test`, ce qui permet de tester le comportement réel du réveil, y compris le fade-in.

### Radio `/radio`

La page Radio sert uniquement au player manuel :

- choix de station ;
- lecture directe sans fade-in ;
- affichage des métadonnées si disponibles ;
- waveform dynamique ;
- bouton Stop seulement pendant la lecture.

---

## Flux audio et logique de lecture

Le moteur central est :

```bash
scripts/player/play_reveil.sh
```

Il accepte trois paramètres :

```bash
bash scripts/player/play_reveil.sh <mode> <station_id> <context>
```

### Modes

```text
playlist  # lecture de la playlist locale
random    # playlist locale mélangée
radio     # lecture d’une station radio
fip       # raccourci historique vers radio fip
```

### Contextes

```text
alarm   # réveil réel via cron, fade-in selon configuration
test    # test du réveil, fade-in selon configuration
manual  # radio ou lecteur manuel, fade-in désactivé
```

### Exemples

```bash
# Réveil playlist avec fade selon configuration
bash scripts/player/play_reveil.sh playlist

# Réveil aléatoire avec fade selon configuration
bash scripts/player/play_reveil.sh random fip alarm

# Test sonore respectant les réglages de fade
bash scripts/player/play_reveil.sh random fip test

# Radio manuelle sans fade-in
bash scripts/player/play_reveil.sh radio fip manual
```

---

## Waveform dynamique

La waveform V2 repose sur trois niveaux :

1. `mpv` joue la source audio.
2. `audio_waveform_source_watcher.py` interroge le socket IPC de `mpv` pour connaître la source courante.
3. `audio_waveform_monitor.py` lance `ffmpeg` sur cette source et calcule un niveau audio léger.

Le fichier d’état produit est :

```text
state/audio_waveform.json
```

Exemple :

```json
{
  "ok": true,
  "active": true,
  "source": "/home/kxsbpi/music/reveil/01 - exemple.webm",
  "ts": 1777649241.42,
  "level": 0.37,
  "bars": [0.12, 0.18, 0.31]
}
```

L’interface web ne dessine pas les barres brutes. Elle utilise `level` comme énergie générale pour générer une onde Canvas fluide. Cela évite l’effet saccadé et donne un rendu plus vivant.

---

## Installation

### 1. Cloner la branche V2

```bash
cd /home/kxsbpi
git clone -b V2 https://github.com/kxsb/Reveil_kxsbpi.git reveil
cd /home/kxsbpi/reveil
```

Si le dépôt existe déjà :

```bash
cd /home/kxsbpi/reveil
git fetch origin
git switch V2
git pull
```

### 2. Installer les dépendances système

```bash
sudo apt update
sudo apt install -y \
  python3 \
  python3-pip \
  mpv \
  ffmpeg \
  socat \
  git
```

### 3. Installer Flask

Selon l’environnement du Pi :

```bash
pip3 install flask
```

ou, si le système impose un environnement virtuel :

```bash
python3 -m venv ~/reveil-venv
source ~/reveil-venv/bin/activate
pip install flask
```

### 4. Installer yt-dlp

```bash
python3 -m pip install --user -U yt-dlp
```

Vérifier :

```bash
~/.local/bin/yt-dlp --version
```

### 5. Rendre les scripts exécutables

```bash
chmod +x scripts/alarm/alarm_tick.sh
chmod +x scripts/player/play_reveil.sh
chmod +x scripts/playlist/update_playlist.sh
chmod +x scripts/player/audio_waveform_monitor.py
chmod +x scripts/player/audio_waveform_source_watcher.py
chmod +x scripts/radio/radio_meta.py
chmod +x scripts/radio/radio_meta_icy.py
```

---

## Configuration

### `config/reveil.conf`

Ce fichier définit le prochain réveil.

Exemples :

```text
07:30 playlist
```

```text
07:30 random
```

```text
07:30 radio fip
```

Format :

```text
HH:MM <mode> [station_id]
```

### `config/reveil_settings.conf`

Exemple :

```text
ENABLE_FADE=1
INITIAL_VOLUME=10
MAX_VOLUME=80
FADE_DURATION=120
FADE_CURVE=ease_out
```

Variables :

| Variable | Rôle |
|---|---|
| `ENABLE_FADE` | Active ou désactive le réveil progressif |
| `INITIAL_VOLUME` | Volume de départ |
| `MAX_VOLUME` | Volume final |
| `FADE_DURATION` | Durée du fade en secondes |
| `FADE_CURVE` | Courbe de montée |

### `config/radio_stations.json`

Ce fichier contient les stations disponibles.

Exemple de station :

```json
"fip": {
  "label": "FIP",
  "stream_url": "https://stream.radiofrance.fr/fip/fip_hifi.m3u8",
  "fallback_url": "https://icecast.radiofrance.fr/fip-hifi.aac",
  "meta_type": "radiofrance_livemeta",
  "meta_station_id": 7
}
```

Types de métadonnées actuellement prévus :

```text
radiofrance_livemeta
nts
icy
none
```

---

## Lancement de l’interface

Depuis le Pi :

```bash
cd /home/kxsbpi/reveil
python3 app/app.py
```

Puis ouvrir depuis un téléphone ou un PC sur le réseau local :

```text
http://IP_DU_PI:8080/
```

Routes principales :

```text
/        hub principal
/alarm   sous-app réveil
/radio   sous-app radio
```

---

## Cron : réveil et mise à jour playlist

Éditer le cron :

```bash
crontab -e
```

Configuration recommandée :

```cron
0 12 * * * /bin/bash /home/kxsbpi/reveil/scripts/playlist/update_playlist.sh >> /home/kxsbpi/reveil/logs/playlist_update.log 2>&1
* * * * * /bin/bash /home/kxsbpi/reveil/scripts/alarm/alarm_tick.sh >> /home/kxsbpi/reveil/logs/cron.log 2>&1
```

La première ligne met à jour la playlist tous les jours à midi. La seconde vérifie chaque minute s’il faut déclencher le réveil.

---

## Commandes utiles

### Lancer la radio FIP manuellement

```bash
bash scripts/player/play_reveil.sh radio fip manual
```

### Lancer la playlist

```bash
bash scripts/player/play_reveil.sh playlist
```

### Lancer la playlist en aléatoire

```bash
bash scripts/player/play_reveil.sh random
```

### Tester le comportement du réveil

```bash
bash scripts/player/play_reveil.sh random fip test
```

### Arrêter la lecture

```bash
pkill -x mpv
pkill -f audio_waveform_source_watcher.py
pkill -f audio_waveform_monitor.py
pkill -x ffmpeg
```

Depuis l’interface, utiliser le bouton Stop.

### Mettre à jour la playlist

```bash
bash scripts/playlist/update_playlist.sh
```

### Recalculer seulement la loudness

```bash
python3 scripts/playlist/analyze_loudness.py \
  /home/kxsbpi/music/reveil \
  -o /home/kxsbpi/reveil/data/loudness_index.json \
  --relative-paths \
  --target-lufs -18
```

---

## API locale Flask

### Pages

| Route | Rôle |
|---|---|
| `/` | Hub principal |
| `/alarm` | Interface réveil |
| `/radio` | Interface radio |

### Réveil

| Route | Méthode | Rôle |
|---|---|---|
| `/set_ajax` | POST | Sauvegarde heure/source |
| `/set` | POST | Sauvegarde classique puis redirection |
| `/settings_ajax` | POST | Sauvegarde des paramètres de fade |
| `/alarm_status` | GET | État du réveil programmé |
| `/test` | POST | Test sonore via moteur principal |

### Player

| Route | Méthode | Rôle |
|---|---|---|
| `/play_playlist` | POST | Lance la playlist |
| `/play_radio/<station_id>` | POST | Lance une radio en contexte manuel |
| `/play_fip` | POST | Raccourci vers FIP |
| `/stop` | POST | Stoppe mpv et la waveform |
| `/status` | GET | État courant du player |
| `/waveform` | GET | État courant de la waveform |

### Radio

| Route | Méthode | Rôle |
|---|---|---|
| `/radio_stations` | GET | Liste des stations configurées |
| `/radio_now/<station_id>` | GET | Métadonnées live d’une station |

---

## Logs et fichiers d’état

### Logs

```text
logs/web.log              actions Flask
logs/player.log           moteur audio
logs/alarm.log            vérification cron réveil
logs/cron.log             sortie cron
logs/update.log           mise à jour playlist
logs/playlist_update.log  cron de mise à jour playlist
```

### État player

```text
state/player_state.json
```

Exemple :

```json
{
  "status": "playing",
  "context": "manual",
  "mode": "radio",
  "station_id": "fip",
  "source_label": "FIP",
  "started_at": 1777649241
}
```

Statuts possibles :

```text
idle
fading
playing
stopped
unknown
```

### État waveform

```text
state/audio_waveform.json
state/audio_waveform.pid
state/audio_waveform_manager.pid
```

---

## Dépannage

### Voir si l’interface tourne déjà

```bash
ss -ltnp | grep ':8080'
```

### Redémarrer l’interface

```bash
kill PID_ICI
cd /home/kxsbpi/reveil
python3 app/app.py
```

### Vérifier les routes Flask

```bash
cd /home/kxsbpi/reveil
PYTHONPATH=app python3 <<'PY'
from app import app
for rule in app.url_map.iter_rules():
    print(rule)
PY
```

### Vérifier le socket mpv

```bash
printf '{ "command": ["get_property", "path"] }\n' | socat - /tmp/mpv_socket
```

### Vérifier la waveform

```bash
cat state/audio_waveform.json
ps aux | grep -E "audio_waveform|ffmpeg" | grep -v grep
```

### Vérifier les scripts

```bash
bash -n scripts/alarm/alarm_tick.sh
bash -n scripts/player/play_reveil.sh
bash -n scripts/playlist/update_playlist.sh
python3 -m py_compile app/app.py app/services/*.py scripts/player/*.py scripts/radio/*.py scripts/playlist/*.py
```

### Le bouton Stop n’apparaît pas

Vérifier :

```bash
cat state/player_state.json
curl -s http://127.0.0.1:8080/status
```

Le bouton Stop n’apparaît que si le statut est `playing` ou `fading`.

### La waveform ne bouge pas

Vérifier dans l’ordre :

```bash
cat state/audio_waveform_manager.pid
cat state/audio_waveform.pid
cat state/audio_waveform.json
printf '{ "command": ["get_property", "path"] }\n' | socat - /tmp/mpv_socket
```

Puis relancer proprement :

```bash
pkill -x mpv 2>/dev/null || true
pkill -f audio_waveform_source_watcher.py 2>/dev/null || true
pkill -f audio_waveform_monitor.py 2>/dev/null || true
pkill -x ffmpeg 2>/dev/null || true
bash scripts/player/play_reveil.sh radio fip manual
```

### Le réveil ne se déclenche pas

Vérifier :

```bash
cat config/reveil.conf
bash scripts/alarm/alarm_tick.sh
tail -n 50 logs/alarm.log
crontab -l
```

### La playlist ne se met pas à jour

Vérifier :

```bash
bash scripts/playlist/update_playlist.sh
tail -n 100 logs/update.log
which ffmpeg
~/.local/bin/yt-dlp --version
```

---

## Branches et Git

Branche recommandée pour cette version :

```text
V2
```

Commandes utiles :

```bash
git status
git switch V2
git pull
git push -u origin V2
```

Les fichiers de configuration vivants du Pi peuvent être ignorés localement avec :

```bash
git update-index --skip-worktree config/reveil.conf config/reveil_settings.conf
```

Pour annuler :

```bash
git update-index --no-skip-worktree config/reveil.conf config/reveil_settings.conf
```

---

## Points d’attention techniques

### Chemins fixes

Le projet utilise actuellement des chemins fixes :

```text
/home/kxsbpi/reveil
/home/kxsbpi/music/reveil
```

C’est simple et robuste pour le Pi actuel, mais à rendre configurable si le projet doit être réinstallé sur d’autres machines.

### Stop global de mpv

Le stop utilise encore :

```bash
pkill -x mpv
```

C’est acceptable pour un Pi dédié. À terme, il serait préférable de stopper uniquement le PID lancé par l’application.

### Sécurité réseau

L’interface est prévue pour un réseau local domestique. Elle n’a pas d’authentification. Ne pas exposer directement le port `8080` à Internet.

### Waveform

La waveform est une représentation visuelle audio-réactive, pas un oscilloscope exact. Elle utilise le niveau réel du flux, puis génère une onde fluide côté navigateur.

---

## Roadmap

### Court terme

- Nettoyer progressivement `app/static/app.js`, actuellement très dense.
- Séparer le JavaScript par sous-app : `alarm.js`, `radio.js`, `player.js`, `waveform.js`.
- Ajouter un vrai lancement systemd pour Flask.
- Améliorer la page Radio : station active, favoris, dernier titre connu.

### Moyen terme

- Ajouter une sous-app Lecteur.
- Envoyer une URL YouTube depuis le téléphone au Raspberry Pi.
- Lire l’audio YouTube en qualité élevée, sans vidéo.
- Ajouter une gestion propre des sorties audio.
- Remplacer le stop global `pkill mpv` par un stop ciblé par PID/socket.

### Long terme

- Ajouter la gestion lumière.
- Ajouter des presets de réveil.
- Ajouter plusieurs alarmes.
- Ajouter une page système : volume, sortie audio, état du Pi, logs.
- Ajouter une authentification légère pour réseau partagé.

---

## Philosophie

Ce projet est un réveil, mais pas seulement. C’est une petite machine domestique de transition : entre sommeil et monde, silence et musique, automatisation et présence.

La V2 pose les fondations : une architecture lisible, des sous-applications, un moteur audio commun et une interface qui commence à parler le langage du son.

> tu peux toujours rêver

