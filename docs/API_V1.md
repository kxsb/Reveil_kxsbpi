# Maison sonore — API v1

Base URL :

    http://<serveur>:8080/api/v1

## Principes

Les réponses utilisent un format JSON stable.

Succès :

    {
      "ok": true,
      "data": {}
    }

Erreur :

    {
      "ok": false,
      "error": {
        "code": "error_code",
        "message": "Description"
      }
    }

Les commandes d'écriture acceptent JSON.

## Endpoints

    GET  /health

    GET  /player/status
    GET  /player/waveform
    POST /player/youtube
    POST /player/radio
    POST /player/playlist
    POST /player/pause
    POST /player/next
    POST /player/previous
    POST /player/stop

    GET  /radios
    GET  /radios/<id>/now

    GET  /playlists
    GET  /playlists/<id>/files

    GET  /alarm
    PUT  /alarm

    GET  /sleep
    PUT  /sleep

    GET  /system

## Exemples

Lecture radio :

    {
      "station_id": "fip"
    }

Playlist aléatoire :

    {
      "playlist_id": "reveil",
      "mode": "random"
    }

Playlist à partir d'un morceau :

    {
      "playlist_id": "reveil",
      "mode": "playlist",
      "start_file": "03 - morceau.webm"
    }

Réveil :

    {
      "time": "07:30",
      "mode": "radio:fip"
    }

Anti-veille :

    {
      "time": "23:00",
      "source": "random:antiveille",
      "fade_enabled": "1",
      "duration": "2100",
      "curve": "ease_in"
    }

## Player status

`GET /player/status` expose l'état applicatif ainsi que l'état runtime
réel de MPV.

Exemple :

    {
      "ok": true,
      "data": {
        "status": "playing",
        "runtime": {
          "running": true,
          "paused": false,
          "media_title": "Titre",
          "playlist_position": 0,
          "playlist_index": 1,
          "playlist_count": 9,
          "position_seconds": 12.4,
          "duration_seconds": 215.8,
          "volume": 72
        }
      }
    }

`playlist_position` est indexé à partir de 0.
`playlist_index` est sa représentation utilisateur indexée à partir de 1.

## Contrat playlists

`GET /playlists` n'expose que les informations utiles au client :

    id
    label
    min_audio_files

Les chemins internes du serveur (`output_dir`, `loudness_file`) ne font
pas partie du contrat API.

### Etat effectif du lecteur

Le champ `data.status` représente l'état effectif du lecteur :

    stopped
    playing
    paused
    fading

L'état runtime MPV est prioritaire sur le fichier d'état applicatif afin
d'éviter une incohérence transitoire pendant le démarrage d'une lecture.

### Démarrage du lecteur

`runtime.running` indique que le processus MPV existe.

`runtime.ready` indique que son interface IPC répond et que les propriétés
du média peuvent être lues.

Pendant le court démarrage de MPV, l'API peut donc renvoyer :

    status: "starting"
    runtime.running: true
    runtime.ready: false

Puis :

    status: "playing"
    runtime.running: true
    runtime.ready: true

Le client doit considérer `starting` comme un état normal et transitoire.
