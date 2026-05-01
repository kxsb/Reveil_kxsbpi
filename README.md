# ⏰ Réveil Raspberry Pi – kxsbpi

Un réveil audio intelligent, pilotable depuis une interface web locale, conçu pour tourner sur Raspberry Pi.

---

## 🧠 Concept

Ce projet transforme un Raspberry Pi en réveil autonome avec :

* déclenchement automatique via cron
* interface mobile locale (Flask)
* lecture audio avancée (mpv)
* fade-in configurable (durée, courbe, volume)
* normalisation du volume par piste (loudness)
* visualisation en temps réel du réveil

---

## 🚀 Fonctionnalités

### ⏰ Réveil programmable

* heure configurable
* choix de source :

  * playlist locale
  * radio FIP
  * aléatoire

### 🌅 Réveil progressif

* fade-in activable
* durée configurable
* volume de départ
* courbes disponibles :

  * linéaire
  * ease-in
  * ease-out
  * ease-in-out

### 🎧 Audio avancé

* lecture via `mpv`
* contrôle via socket IPC
* normalisation loudness par piste
* gestion dynamique du volume

### 📊 Interface web

* UI mobile-first
* autosave des réglages
* état en temps réel
* visualisation du fade (courbe + progression)

### 🔄 Playlist dynamique

* téléchargement via `yt-dlp`
* mise à jour automatique
* recalcul loudness

---

## 🧩 Architecture

```
reveil/
├── app/                # interface Flask
│   ├── templates/
│   ├── static/
│   └── app.py
│
├── scripts/            # logique système
│   ├── play_reveil.sh
│   ├── alarm_tick.sh
│   ├── update_playlist.sh
│   └── analyze_loudness.py
│
├── config/
│   ├── reveil.conf
│   └── reveil_settings.conf
│
├── data/
│   └── loudness_index.json
│
├── logs/
├── state/
```

---

## ⚙️ Installation

### 1. Cloner le repo

```bash
git clone https://github.com/kxsb/Reveil_kxsbpi.git
cd Reveil_kxsbpi
```

### 2. Installer les dépendances

```bash
sudo apt update
sudo apt install mpv socat python3 python3-pip -y
pip3 install flask
```

Installer yt-dlp :

```bash
pip3 install --user yt-dlp
```

---

## ▶️ Lancer l’interface

```bash
cd ~/reveil/app
python3 app.py
```

Puis accéder depuis un téléphone :

```
http://IP_DU_PI:8080
```

---

## ⏱️ Activation du réveil automatique

Ajouter au cron :

```bash
crontab -e
```

```cron
* * * * * /bin/bash ~/reveil/scripts/alarm_tick.sh >> ~/reveil/logs/cron.log 2>&1
```

---

## 🔄 Mise à jour playlist

Via interface ou :

```bash
bash ~/reveil/scripts/update_playlist.sh
```

---

## 🧪 Debug

Logs utiles :

```bash
tail -f ~/reveil/logs/player.log
tail -f ~/reveil/logs/cron.log
```

État courant :

```bash
cat ~/reveil/state/player_state.json
```

---

## 🔐 Remarques

* conçu pour usage réseau local
* pas d’authentification (à ajouter si exposition externe)
* dépend de mpv + alsa

---

## 🧬 Roadmap

* [ ] authentification simple
* [ ] presets réveil
* [ ] animation volume live
* [ ] dockerisation
* [ ] intégration météo / agenda

---

## ✨ Auteur

Mickaël Medina / kxsb

---

## 🌀 Philosophie

tu peux toujours rêver