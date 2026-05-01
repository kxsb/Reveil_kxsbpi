// ===============================
// Réveil : heure + source
// ===============================

const alarmTime = document.getElementById("alarmTime");
const alarmMode = document.getElementById("alarmMode");
const saveStatus = document.getElementById("saveStatus");

let alarmSaveTimer = null;

function autosaveAlarm() {
  if (!alarmTime || !alarmMode || !saveStatus) return;

  clearTimeout(alarmSaveTimer);
  saveStatus.textContent = "Sauvegarde…";

  alarmSaveTimer = setTimeout(async () => {
    const data = new FormData();
    data.append("time", alarmTime.value);
    data.append("mode", alarmMode.value);

    try {
      const res = await fetch("/set_ajax", {
        method: "POST",
        body: data,
      });

      const json = await res.json();

      if (json.ok) {
        saveStatus.textContent = "✅ Réveil réglé : " + json.value;

        if (json.next_alarm) {
          if (heroNextAlarm) heroNextAlarm.textContent = json.next_alarm;
          if (dashboardSub) {
            dashboardSub.textContent = json.next_alarm;
            dashboardSub.dataset.default = json.next_alarm;
          }
          if (dashboardTime) {
            dashboardTime.textContent = json.value;
            dashboardTime.dataset.default = json.value;
          }
        }
      } else {
        saveStatus.textContent = "⚠️ Réglage invalide";
      }
    } catch (e) {
      saveStatus.textContent = "❌ Erreur réseau";
    }
  }, 300);
}

if (alarmTime) alarmTime.addEventListener("change", autosaveAlarm);
if (alarmMode) alarmMode.addEventListener("change", autosaveAlarm);


// ===============================
// Panneau paramètres
// ===============================

const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");

if (settingsToggle && settingsPanel) {
  settingsToggle.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });
}


// ===============================
// Paramètres fade
// ===============================

const fadeEnabled = document.getElementById("fadeEnabled");
const fadeOptions = document.getElementById("fadeOptions");
const fadeStatus = document.getElementById("fadeStatus");

function refreshFadeVisibility() {
  if (!fadeEnabled || !fadeOptions) return;
  fadeOptions.style.display = fadeEnabled.checked ? "block" : "none";
}

function getActiveValue(selector) {
  const active = document.querySelector(`${selector} button.active`);
  return active ? active.dataset.value : null;
}

async function saveFadeSettings() {
  if (!fadeStatus) return;

  const data = new FormData();

  data.append("enable_fade", fadeEnabled && fadeEnabled.checked ? "1" : "0");

  const duration = getActiveValue('[data-setting="fadeDuration"]');
  const initialVolume = getActiveValue('[data-setting="initialVolume"]');
  const curve = getActiveValue('[data-setting="fadeCurve"]');

  if (duration) data.append("fade_duration", duration);
  if (initialVolume) data.append("initial_volume", initialVolume);
  if (curve) data.append("fade_curve", curve);

  fadeStatus.textContent = "Sauvegarde des paramètres…";

  try {
    const res = await fetch("/settings_ajax", {
      method: "POST",
      body: data,
    });

    const json = await res.json();

    if (json.ok) {
      fadeStatus.textContent = "✅ Paramètres sauvegardés";
    } else {
      fadeStatus.textContent = "⚠️ Erreur de sauvegarde";
    }
  } catch (e) {
    fadeStatus.textContent = "❌ Erreur réseau";
  }
}

if (fadeEnabled) {
  fadeEnabled.addEventListener("change", () => {
    refreshFadeVisibility();
    saveFadeSettings();
  });
}

document.querySelectorAll(".button-grid button, .curve-picker button").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest("[data-setting]");
    if (!group) return;

    group.querySelectorAll("button").forEach((b) => {
      b.classList.remove("active");
    });

    button.classList.add("active");
    saveFadeSettings();
  });
});

refreshFadeVisibility();

const actionStatus = document.getElementById("actionStatus");

document.querySelectorAll("form[action]:not([data-player-url-form])").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (actionStatus) {
      actionStatus.textContent = "Commande envoyée…";
    }

    try {
      const res = await fetch(form.action, {
        method: "POST",
      });

      const json = await res.json();

      if (json.ok) {
        actionStatus.textContent = json.message;
      } else {
        actionStatus.textContent = "⚠️ Erreur commande";
      }
    } catch (e) {
      actionStatus.textContent = "❌ Erreur réseau";
    }
  });
});

const updatePlaylistButton = document.getElementById("updatePlaylistButton");
const updatePlaylistStatus = document.getElementById("updatePlaylistStatus");

if (updatePlaylistButton && updatePlaylistStatus) {
  updatePlaylistButton.addEventListener("click", async () => {
    updatePlaylistStatus.textContent = "Mise à jour lancée…";

    try {
      const res = await fetch("/update_playlist", {
        method: "POST",
      });

      const json = await res.json();

      if (json.ok) {
        updatePlaylistStatus.textContent = json.message;
      } else {
        updatePlaylistStatus.textContent = "⚠️ Erreur pendant le lancement";
      }
    } catch (e) {
      updatePlaylistStatus.textContent = "❌ Erreur réseau";
    }
  });
}

const heroNextAlarm = document.getElementById("heroNextAlarm");
const dashboardLabel = document.getElementById("dashboardLabel");
const dashboardTime = document.getElementById("dashboardTime");
const dashboardSub = document.getElementById("dashboardSub");

const fadeGraph = document.getElementById("fadeGraph");
const fadeCurvePath = document.getElementById("fadeCurvePath");
const fadeDot = document.getElementById("fadeDot");
const fadeGraphLabel = document.getElementById("fadeGraphLabel");

function getCurvePoint(t, curve) {
  if (curve === "ease_in") return t * t;
  if (curve === "ease_out") return 1 - Math.pow(1 - t, 2);
  if (curve === "ease_in_out") return 3 * t * t - 2 * t * t * t;
  return t;
}

function buildCurvePath(curve) {
  let path = "M 0 60 ";
  for (let x = 0; x <= 100; x += 2) {
    let t = x / 100;
    let y = 60 - getCurvePoint(t, curve) * 50;
    path += `L ${x} ${y} `;
  }
  return path;
}

async function refreshAlarmStatus() {
  try {
    const res = await fetch("/alarm_status");
    const data = await res.json();

    if (!data.ok) return;

    if (heroNextAlarm) {
      heroNextAlarm.textContent = data.next_alarm;
    }

    if (dashboardTime) {
      dashboardTime.dataset.default = data.current;
    }

    if (dashboardSub) {
      dashboardSub.dataset.default = data.next_alarm;
    }

    const alarmEditorIsOpen =
      alarmInlineEditor && !alarmInlineEditor.classList.contains("hidden");

    if (!alarmEditorIsOpen && alarmTime && data.alarm_time) {
      alarmTime.value = data.alarm_time;
    }

    if (!alarmEditorIsOpen && alarmMode && data.alarm_mode) {
      alarmMode.value = data.alarm_mode;
      alarmMode.dataset.current = data.alarm_mode;
    }
  } catch (e) {
    console.error("alarm status error", e);
  }
}

function resetDashboard() {
  if (!dashboardLabel || !dashboardTime || !dashboardSub || !fadeGraph) return;

  fadeGraph.classList.add("hidden");
  dashboardLabel.textContent = "Prochain réveil";
  dashboardTime.textContent = dashboardTime.dataset.default || "";
  dashboardSub.textContent = dashboardSub.dataset.default || "";
}

const radioDashboard = document.getElementById("radioDashboard");
const radioMenu = document.getElementById("radioMenu");

function toggleRadioMenu() {
  if (!radioMenu) return;
  radioMenu.classList.toggle("hidden");
}

if (radioDashboard && radioMenu) {
  radioDashboard.addEventListener("click", (event) => {
    if (event.target.closest(".radio-choice")) return;
    if (event.target.closest(".js-stop-form")) return;
    toggleRadioMenu();
  });

  radioDashboard.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleRadioMenu();
  });
}

async function updateRadioNow(stationId) {
  try {
    const res = await fetch(`/radio_now/${stationId}`);
    const data = await res.json();

    if (!dashboardSub) return;

    if (!data.ok) {
      dashboardSub.textContent = "Radio en direct";
      return;
    }

    const title = data.title || "";
    const artist = data.artist || "";

    if (title && artist) {
      dashboardSub.textContent = `${title} — ${artist}`;
    } else if (title) {
      dashboardSub.textContent = title;
    } else {
      dashboardSub.textContent = "Radio en direct";
    }

  } catch (e) {
    console.error("radio_now error", e);
    if (dashboardSub) dashboardSub.textContent = "Radio en direct";
  }
}

async function loadRadioStations() {
  try {
    const res = await fetch("/radio_stations");
    const data = await res.json();

    if (!data.ok) return;

    const stations = data.stations || {};
    buildRadioMenu(stations);
    buildAlarmSourceOptions(stations);
    updateAlarmSourceBadge(stations);

  } catch (e) {
    console.error("radio_stations error", e);
  }
}

function buildRadioMenu(stations) {
  const radioMenu = document.getElementById("radioMenu");
  if (!radioMenu) return;

  radioMenu.innerHTML = "";

  Object.entries(stations).forEach(([id, s]) => {
    const btn = document.createElement("button");
    btn.className = "radio-choice";
    btn.type = "button";
    btn.dataset.station = id;

    btn.innerHTML = `
      <span>${s.label}</span>
      <small>${id}</small>
    `;

    btn.addEventListener("click", async () => {
      radioMenu.classList.add("hidden");

      if (actionStatus) {
        actionStatus.textContent = "Commande envoyée…";
      }

      const res = await fetch(`/play_radio/${id}`, { method: "POST" });
      const json = await res.json();

      actionStatus.textContent = json.ok ? json.message : "⚠️ Erreur radio";
    });

    radioMenu.appendChild(btn);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadRadioStations();
});

let lastRadioNowFetchAt = 0;

function shouldFetchRadioNow(intervalMs = 15000) {
  const now = Date.now();

  if (now - lastRadioNowFetchAt < intervalMs) {
    return false;
  }

  lastRadioNowFetchAt = now;
  return true;
}

async function updateStatus(dataOverride = null) {
  try {
    let data = dataOverride;

    if (!data) {
      const res = await fetch("/status", { cache: "no-store" });
      data = await res.json();
    }

    const hasDashboard =
      dashboardLabel &&
      dashboardTime &&
      dashboardSub;

    if (!hasDashboard) {
      return;
    }

    if (data.status === "fading") {
      if (fadeGraph) fadeGraph.classList.remove("hidden");

      const label = data.source_label || "Réveil";

      dashboardLabel.textContent = "🌅 Réveil en cours";
      dashboardTime.textContent = label;
      dashboardSub.textContent = "Montée progressive";

      const elapsed = data.now - data.started_at;
      const progress = Math.min(elapsed / data.fade_duration, 1);
      const p = getCurvePoint(progress, data.fade_curve);

      const x = progress * 100;
      const y = 60 - p * 50;

      if (fadeCurvePath && fadeDot && fadeGraphLabel) {
        fadeCurvePath.setAttribute("d", buildCurvePath(data.fade_curve));
        fadeDot.setAttribute("cx", x);
        fadeDot.setAttribute("cy", y);

        fadeGraphLabel.textContent =
          Math.round(p * (data.max_volume - data.initial_volume) + parseInt(data.initial_volume)) + "%";
      }

      return;
    }

    if (data.status === "playing") {
      if (fadeGraph) fadeGraph.classList.add("hidden");

      const label = data.source_label || "Lecture";

      dashboardLabel.textContent = "🎧 Lecture en cours";
      dashboardTime.textContent = label;

      if (data.mode === "radio") {
        if (
          dashboardSub.textContent === "" ||
          dashboardSub.textContent === "Stream radio" ||
          dashboardSub.textContent === "Chargement du titre…"
        ) {
          dashboardSub.textContent = "Chargement du titre…";
        }

        if (data.station_id && shouldFetchRadioNow()) {
          updateRadioNow(data.station_id);
        }

      } else if (data.mode === "youtube") {
        dashboardSub.textContent = "Audio YouTube";
      } else {
        dashboardSub.textContent = "Lecture en cours";
      }

      return;
    }

    resetDashboard();

  } catch (e) {
    console.error("status error", e);
  }
}

// ===============================
// UX multi-app : stop, waveform, source réveil
// ===============================

function setStopVisible(isVisible) {
  document.querySelectorAll(".js-stop-form").forEach((form) => {
    form.classList.toggle("hidden", !isVisible);
  });
}

function setWaveformVisible(isVisible) {
  const liveWaveform = document.getElementById("liveWaveform");

  if (liveWaveform) {
    liveWaveform.classList.toggle("hidden", !isVisible);
  }
}

function clearHomePlayingTiles() {
  document.querySelectorAll("[data-home-app]").forEach((tile) => {
    tile.classList.remove("is-playing");
    const wave = tile.querySelector(".mini-waveform");
    if (wave) wave.classList.add("hidden");
  });
}

function markHomePlayingTile(data) {
  clearHomePlayingTiles();

  if (!data || !["playing", "fading"].includes(data.status)) {
    return;
  }

  let target = null;

  if (data.context === "alarm" || data.status === "fading") {
    target = document.querySelector('[data-home-app="alarm"]');
  } else if (data.mode === "radio") {
    target = document.querySelector('[data-home-app="radio"]');
  } else {
    target = document.querySelector('[data-home-app="player"]');
  }

  if (!target) return;

  target.classList.add("is-playing");
  const wave = target.querySelector(".mini-waveform");
  if (wave) wave.classList.remove("hidden");
}

function updatePlaybackUx(data) {
  const isPlaying = data && ["playing", "fading"].includes(data.status);

  setStopVisible(isPlaying);
  setWaveformVisible(isPlaying);
  markHomePlayingTile(data);
}

function buildAlarmSourceOptions(stations) {
  if (!alarmMode) return;

  const radioGroup = document.getElementById("alarmRadioOptions");
  if (!radioGroup) return;

  const current = alarmMode.dataset.current || alarmMode.value;

  radioGroup.innerHTML = "";

  Object.entries(stations).forEach(([id, station]) => {
    const option = document.createElement("option");
    option.value = `radio:${id}`;
    option.textContent = `Radio — ${station.label || id}`;

    if (current === option.value) {
      option.selected = true;
    }

    radioGroup.appendChild(option);
  });
}

let latestPlaybackData = null;

// Surveille le statut player avec un seul fetch partagé.
async function playerTick() {
  try {
    const res = await fetch("/status", { cache: "no-store" });
    const data = await res.json();
    latestPlaybackData = data;

    await updateStatus(data);
    updatePlaybackUx(data);
  } catch (e) {
    console.error("player tick error", e);
  }
}

playerTick();
setInterval(playerTick, 3000);

// ===============================
// Réveil : édition inline dans le dashboard
// ===============================

const alarmDashboard = document.getElementById("alarmDashboard");
const alarmInlineEditor = document.getElementById("alarmInlineEditor");

refreshAlarmStatus();
setInterval(refreshAlarmStatus, 60000);

function openAlarmEditor() {
  if (!alarmDashboard || !alarmInlineEditor) return;

  alarmInlineEditor.classList.remove("hidden");
  alarmDashboard.classList.add("is-editing");

  if (alarmTime) {
    setTimeout(() => alarmTime.focus(), 80);
  }
}

function closeAlarmEditor() {
  if (!alarmDashboard || !alarmInlineEditor) return;

  alarmInlineEditor.classList.add("hidden");
  alarmDashboard.classList.remove("is-editing");
}

function toggleAlarmEditor() {
  if (!alarmInlineEditor) return;

  if (alarmInlineEditor.classList.contains("hidden")) {
    openAlarmEditor();
  } else {
    closeAlarmEditor();
  }
}

if (alarmDashboard && alarmInlineEditor) {
  alarmDashboard.addEventListener("click", (event) => {
    if (event.target.closest("#alarmInlineEditor")) return;
    toggleAlarmEditor();
  });
}

function formatAlarmModeLabel(mode, stations = {}) {
  if (!mode) return "Source";

  if (mode === "playlist") return "Playlist réveil";
  if (mode === "random") return "Aléatoire";

  if (mode.startsWith("radio:")) {
    const stationId = mode.split(":")[1] || "";
    const station = stations[stationId];
    return station ? `Radio — ${station.label || stationId}` : `Radio — ${stationId}`;
  }

  if (mode === "fip") return "Radio — FIP";

  return mode;
}

function updateAlarmSourceBadge(stations = {}) {
  const badge = document.getElementById("alarmSourceBadge");
  if (!badge || !alarmMode) return;

  badge.textContent = formatAlarmModeLabel(alarmMode.value || alarmMode.dataset.current, stations);
}

function showActionStatus(message, duration = 2500) {
  const el = document.getElementById("actionStatus");
  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");

  if (duration > 0) {
    window.clearTimeout(el._hideTimer);
    el._hideTimer = window.setTimeout(() => {
      el.classList.add("hidden");
    }, duration);
  }
}

// ===============================
// Premium waveform canvas
// Onde fluide générée côté navigateur,
// modulée par le vrai niveau audio.
// ===============================

const premiumWaveform = {
  targetLevel: 0,
  currentLevel: 0,
  active: false,
  phase: 0,
  lastPoll: 0,
};

function ensureWaveCanvas(container) {
  if (!container) return null;

  container.classList.add("is-canvas-wave");

  let canvas = container.querySelector("canvas.wave-canvas");

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "wave-canvas";
    container.innerHTML = "";
    container.appendChild(canvas);
  }

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas;
}

function drawPremiumWave(container, options = {}) {
  const canvas = ensureWaveCanvas(container);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, w, h);

  const level = premiumWaveform.currentLevel;
  const active = premiumWaveform.active;

  if (!active && level < 0.015) {
    return;
  }

  const baseAmp = options.baseAmp || 0.10;
  const ampBoost = options.ampBoost || 0.34;
  const lineWidth = (options.lineWidth || 2.2) * dpr;

  const mid = h * 0.5;
  const amp = h * (baseAmp + level * ampBoost);
  const points = options.points || 96;

  const phase = premiumWaveform.phase;
  const speed1 = phase * 1.0;
  const speed2 = phase * 0.63;
  const speed3 = phase * 1.37;

  ctx.beginPath();

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w;
    const t = i / points;

    // Fenêtre douce : l'onde respire au centre et s'apaise aux bords.
    const envelope = Math.sin(Math.PI * t);

    // Mélange de sinusoïdes pour éviter l'effet métronome cheap.
    const y1 = Math.sin(t * Math.PI * 2.0 + speed1);
    const y2 = Math.sin(t * Math.PI * 5.0 - speed2) * 0.38;
    const y3 = Math.sin(t * Math.PI * 9.0 + speed3) * 0.16;

    const y = mid + (y1 + y2 + y3) * amp * envelope;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(246, 243, 247, 0.90)";
  ctx.stroke();

  // Deuxième onde fantôme, plus douce, pour donner de la profondeur.
  ctx.beginPath();

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w;
    const t = i / points;
    const envelope = Math.sin(Math.PI * t);

    const y =
      mid +
      Math.sin(t * Math.PI * 3.0 - phase * 0.72) *
        amp *
        0.42 *
        envelope;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.lineWidth = Math.max(1, lineWidth * 0.65);
  ctx.strokeStyle = "rgba(246, 243, 247, 0.28)";
  ctx.stroke();
}

function animatePremiumWaveforms() {
  // Mouvement continu, indépendant du polling réseau.
  premiumWaveform.phase += 0.045 + premiumWaveform.currentLevel * 0.035;

  // Lissage de l'énergie réelle.
  premiumWaveform.currentLevel +=
    (premiumWaveform.targetLevel - premiumWaveform.currentLevel) * 0.075;

  const live = document.getElementById("liveWaveform");

  if (live && !live.classList.contains("hidden")) {
    drawPremiumWave(live, {
      baseAmp: 0.08,
      ampBoost: 0.36,
      lineWidth: 2.4,
      points: 120,
    });
  }

  document.querySelectorAll(".app-tile.is-playing .mini-waveform").forEach((wave) => {
    drawPremiumWave(wave, {
      baseAmp: 0.12,
      ampBoost: 0.32,
      lineWidth: 1.8,
      points: 72,
    });
  });

  requestAnimationFrame(animatePremiumWaveforms);
}

async function pollPremiumWaveformLevel() {
  try {
    const res = await fetch("/waveform", { cache: "no-store" });
    const data = await res.json();

    const playbackActive =
      latestPlaybackData &&
      ["playing", "fading"].includes(latestPlaybackData.status);

    if (data && data.active) {
      premiumWaveform.active = true;

      let level = Number(data.level || 0);

      // Compression musicale : évite que l'onde soit plate ou hystérique.
      level = Math.sqrt(Math.max(0, Math.min(1, level)));
      premiumWaveform.targetLevel = Math.max(0.08, Math.min(1, level));
    } else if (playbackActive) {
      // Fallback visuel : certaines sources, notamment YouTube via yt-dlp,
      // peuvent être lisibles par mpv mais non rouvertes proprement par ffmpeg.
      // On garde alors une onde douce pour signaler la lecture active.
      premiumWaveform.active = true;
      premiumWaveform.targetLevel = latestPlaybackData.mode === "youtube" ? 0.18 : 0.12;
    } else {
      premiumWaveform.active = false;
      premiumWaveform.targetLevel = 0;
    }
  } catch (e) {
    premiumWaveform.active = false;
    premiumWaveform.targetLevel = 0;
  }
}

setInterval(() => {
  if (!document.hidden) {
    pollPremiumWaveformLevel();
  }
}, 750);

pollPremiumWaveformLevel();
requestAnimationFrame(animatePremiumWaveforms);


// ===============================
// Lecteur YouTube audio
// ===============================

const playerUrlForm = document.getElementById("playerUrlForm");
const playerUrlInput = document.getElementById("playerUrlInput");

if (playerUrlForm && playerUrlInput) {
  playerUrlForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const url = playerUrlInput.value.trim();

    if (!url) {
      if (actionStatus) actionStatus.textContent = "URL manquante";
      return;
    }

    const data = new FormData();
    data.append("url", url);

    if (actionStatus) actionStatus.textContent = "Lancement…";

    try {
      const res = await fetch("/play_url", {
        method: "POST",
        body: data,
      });

      const json = await res.json();

      if (actionStatus) {
        actionStatus.textContent = json.message || (json.ok ? "Lecture lancée" : "Erreur");
      }

      if (json.ok && typeof playerTick === "function") {
        setTimeout(playerTick, 1200);
      }
    } catch (e) {
      if (actionStatus) actionStatus.textContent = "Erreur réseau";
    }
  });
}
