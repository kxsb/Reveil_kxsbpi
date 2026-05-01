// ===============================
// Réveil : heure + source
// ===============================

function isAlarmPage() {
  return (
    document.body.classList.contains("page-alarm") ||
    Boolean(document.getElementById("alarmSourceBadge"))
  );
}

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
        saveStatus.textContent = "✅ Réveil réglé";

        if (json.next_alarm) {
          if (heroNextAlarm) heroNextAlarm.textContent = json.next_alarm;
          if (dashboardSub) {
            dashboardSub.textContent = json.next_alarm;
            dashboardSub.dataset.default = json.next_alarm;
          }
          // Ne jamais injecter json.value brut dans la grosse heure :
          // il peut contenir "22:17 radio:fip".
          if (typeof renderAlarmFromCurrentInputs === "function") {
            renderAlarmFromCurrentInputs();
          }

          if (typeof refreshAlarmStatus === "function") {
            setTimeout(refreshAlarmStatus, 250);
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


// Synchronise le bouton "Tester le son" avec la source actuellement choisie.
const testSoundMode = document.getElementById("testSoundMode");

function syncTestSoundMode() {
  if (!testSoundMode || !alarmMode) return;
  testSoundMode.value = alarmMode.value || alarmMode.dataset.current || "random";
}

if (alarmMode) {
  alarmMode.addEventListener("change", () => {
    if (testSoundMode) {
      testSoundMode.value = alarmMode.value || "random";
    }
  });
}

if (testSoundMode && alarmMode) {
  syncTestSoundMode();

  alarmMode.addEventListener("change", syncTestSoundMode);

  const testSoundForm = testSoundMode.closest("form");

  if (testSoundForm) {
    testSoundForm.addEventListener("submit", syncTestSoundMode, true);
  }
}



function renderAlarmFromCurrentInputs() {
  if (!isAlarmPage()) return;
  if (!alarmTime || !alarmMode) return;

  renderCleanAlarmDashboard(
    {
      alarm_time: alarmTime.value || "—",
      alarm_mode: alarmMode.value || alarmMode.dataset.current || "random",
      next_alarm: dashboardSub ? dashboardSub.textContent : "",
    },
    window.__radioStations || {},
    window.__playlists || []
  );
}

if (alarmMode) {
  alarmMode.addEventListener("change", renderAlarmFromCurrentInputs);
}

if (alarmTime) {
  alarmTime.addEventListener("change", renderAlarmFromCurrentInputs);
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
    const res = await fetch("/alarm_status", { cache: "no-store" });
    const data = await res.json();

    // Important :
    // Les pages Radio / Lecteur / Config utilisent aussi dashboardTime/dashboardSub.
    // On ne rend donc la carte "Prochain réveil" que sur la page Réveil.
    if (isAlarmPage()) {
      renderCleanAlarmDashboard(
        data,
        window.__radioStations || {},
        window.__playlists || []
      );
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
    const [radioRes, playlistsRes] = await Promise.all([
      fetch("/radio_stations"),
      fetch("/playlists"),
    ]);

    const radioData = await radioRes.json();
    const playlistsData = await playlistsRes.json();

    if (!radioData.ok) return;

    const stations = radioData.stations || {};
    const playlists = playlistsData.ok ? (playlistsData.playlists || []) : [];

    window.__radioStations = stations;
    window.__playlists = playlists;

    buildRadioMenu(stations);
    buildAlarmSourceOptions(stations, playlists);
    updateAlarmSourceBadge(stations, playlists);
    await refreshAlarmStatus();

    try {
      const alarmRes = await fetch("/alarm_status", { cache: "no-store" });
      const alarmData = await alarmRes.json();
      if (isAlarmPage()) {
        renderCleanAlarmDashboard(alarmData, stations, playlists);
      }
    } catch (e) {
      console.error("alarm dashboard render error", e);
    }

  } catch (e) {
    console.error("source loading error", e);
  }
}

function buildRadioMenu(stations) {
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
      } else if (data.mode === "local") {
        dashboardSub.textContent = "Fichier local";
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
  const isPlaying =
    data &&
    ["playing", "fading"].includes(data.status);

  // Boutons stop visibles seulement pendant une lecture.
  document.querySelectorAll(".js-stop-form").forEach((form) => {
    form.classList.toggle("hidden", !isPlaying);
  });

  // Nettoyage des tuiles accueil.
  document.querySelectorAll("[data-home-app]").forEach((tile) => {
    tile.classList.remove("active", "playing", "is-playing");

    const wave = tile.querySelector(".mini-waveform");
    if (wave) {
      wave.classList.add("hidden");
    }
  });

  if (!isPlaying) return;

  let app = "player";

  // Priorité au contexte : sleep/alarm sont des usages,
  // radio/youtube/local sont des modes techniques.
  if (data.context === "sleep") {
    app = "sleep";
  } else if (data.context === "alarm") {
    app = "alarm";
  } else if (data.mode === "radio") {
    app = "radio";
  } else if (data.mode === "youtube" || data.mode === "local") {
    app = "player";
  }

  const target = document.querySelector(`[data-home-app="${app}"]`);

  if (!target) return;

  target.classList.add("active", "playing", "is-playing");

  const wave = target.querySelector(".mini-waveform");
  if (wave) {
    wave.classList.remove("hidden");
  }
}

function buildAlarmSourceOptions(stations, playlists = []) {
  if (!alarmMode) return;

  const playlistGroup = document.getElementById("alarmPlaylistOptions");
  const radioGroup = document.getElementById("alarmRadioOptions");

  const current = alarmMode.dataset.current || alarmMode.value;

  if (playlistGroup) {
    playlistGroup.innerHTML = "";

    const normalizedPlaylists =
      Array.isArray(playlists) && playlists.length > 0
        ? playlists
        : [{ id: "reveil", label: "Réveil" }];

    normalizedPlaylists.forEach((playlist) => {
      const id = playlist.id || "reveil";
      const label = playlist.label || id;

      [
        [`random:${id}`, `Aléatoire — ${label}`],
        [`playlist:${id}`, `Playlist — ${label}`],
      ].forEach(([value, text]) => {
        const option = document.createElement("option");

        // Compat historique : les valeurs reveil peuvent rester random/playlist.
        if (id === "reveil") {
          option.value = value.startsWith("random") ? "random" : "playlist";
        } else {
          option.value = value;
        }

        option.textContent = text;

        if (current === option.value || current === value) {
          option.selected = true;
        }

        playlistGroup.appendChild(option);
      });
    });
  }

  if (radioGroup) {
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
}


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















function cleanAlarmTimeFromStatus(data) {
  if (!data) return "—";

  const candidates = [
    data.alarm_time,
    data.time,
    data.next_alarm_label,
    data.alarm_label,
    data.label,
  ];

  for (const item of candidates) {
    if (!item) continue;
    const match = String(item).match(/([0-9]{1,2}:[0-9]{2})/);
    if (match) return match[1];
  }

  return "—";
}

function cleanAlarmModeFromStatus(data) {
  if (!data) return "random";

  if (data.alarm_mode) return data.alarm_mode;
  if (data.mode) return data.mode;

  const raw = String(
    data.alarm_time ||
    data.next_alarm_label ||
    data.alarm_label ||
    data.label ||
    ""
  ).trim();

  const parts = raw.split(/\s+/);

  if (parts.length >= 2) {
    const mode = parts[1];

    if (mode.includes(":")) return mode;
    if (mode === "radio" && parts[2]) return `radio:${parts[2]}`;
    if ((mode === "random" || mode === "playlist") && parts[2]) return `${mode}:${parts[2]}`;
    if (mode === "random" || mode === "playlist") return mode;
  }

  return "random";
}

function cleanAlarmUntilFromStatus(data) {
  if (!data) return "";

  const candidates = [
    data.time_until,
    data.next_alarm_in,
    data.until,
    data.remaining,
    data.next_alarm,
  ];

  for (const item of candidates) {
    if (!item) continue;

    const text = String(item).trim();

    // On évite de réafficher "22:17 radio:xxx" comme temps restant.
    if (/^[0-9]{1,2}:[0-9]{2}/.test(text)) continue;

    return text;
  }

  return "";
}

function renderCleanAlarmDashboard(data, stations = {}, playlists = []) {
  const sourceBadge = document.getElementById("alarmSourceBadge");

  if (!dashboardTime || !dashboardSub) return;

  const alarmTimeValue = cleanAlarmTimeFromStatus(data);
  const alarmModeValue = cleanAlarmModeFromStatus(data);
  const untilValue = cleanAlarmUntilFromStatus(data);

  // Minimalisme :
  // - grosse ligne = heure seule ;
  // - badge = source ;
  // - sous-texte = temps restant.
  dashboardTime.textContent = alarmTimeValue;

  if (sourceBadge) {
    sourceBadge.textContent = formatAlarmModeLabel(alarmModeValue, stations, playlists);
  }

  dashboardSub.textContent = untilValue || "";

  if (alarmTime) {
    alarmTime.value = alarmTimeValue === "—" ? "" : alarmTimeValue;
  }

  if (alarmMode) {
    alarmMode.value = alarmModeValue;
    alarmMode.dataset.current = alarmModeValue;
  }

  const testSoundMode = document.getElementById("testSoundMode");
  if (testSoundMode) {
    testSoundMode.value = alarmModeValue;
  }

  const saveStatus = document.getElementById("saveStatus");
  if (saveStatus && saveStatus.textContent.includes(":")) {
    saveStatus.textContent = "Réglage automatique activé";
  }
}

function formatAlarmModeLabel(mode, stations = {}, playlists = []) {
  if (!mode) return "Source";

  const playlistById = {};
  (playlists || []).forEach((playlist) => {
    playlistById[playlist.id] = playlist;
  });

  if (mode === "playlist") return "Playlist — Réveil";
  if (mode === "random") return "Aléatoire — Réveil";

  if (mode.startsWith("playlist:") || mode.startsWith("random:")) {
    const [kind, playlistId] = mode.split(":");
    const playlist = playlistById[playlistId];
    const label = playlist ? (playlist.label || playlistId) : playlistId;

    return kind === "random"
      ? `Aléatoire — ${label}`
      : `Playlist — ${label}`;
  }

  if (mode.startsWith("radio:")) {
    const stationId = mode.split(":")[1] || "";
    const station = stations[stationId];
    return station ? `Radio — ${station.label || stationId}` : `Radio — ${stationId}`;
  }

  if (mode === "fip") return "Radio — FIP";

  return mode;
}


function updateAlarmSourceBadge(stations = {}, playlists = []) {
  const badge = document.getElementById("alarmSourceBadge");
  if (!badge || !alarmMode) return;

  badge.textContent = formatAlarmModeLabel(alarmMode.value || alarmMode.dataset.current, stations, playlists);
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


// ===============================
// Lecteur : dossier musique local
// ===============================

const musicLibraryToggle = document.getElementById("musicLibraryToggle");
const musicLibraryList = document.getElementById("musicLibraryList");
const musicLibraryCount = document.getElementById("musicLibraryCount");

let musicLibraryLoaded = false;

function renderMusicLibrary(files) {
  if (!musicLibraryList) return;

  musicLibraryList.innerHTML = "";

  if (!files || files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "small music-empty";
    empty.textContent = "Aucun fichier audio local.";
    musicLibraryList.appendChild(empty);
    return;
  }

  files.forEach((file) => {
    const button = document.createElement("button");
    button.className = "music-file-choice";
    button.type = "button";
    button.dataset.path = file.path;

    button.innerHTML = `
      <span>${file.label || file.filename}</span>
      <small>${file.filename}</small>
    `;

    button.addEventListener("click", async () => {
      const data = new FormData();
      data.append("path", file.path);

      if (actionStatus) actionStatus.textContent = "Lancement…";

      try {
        const res = await fetch("/play_file", {
          method: "POST",
          body: data,
        });

        const json = await res.json();

        if (actionStatus) {
          actionStatus.textContent = json.message || (json.ok ? "Lecture lancée" : "Erreur");
        }

        if (json.ok) {
          musicLibraryList.classList.add("hidden");
          setTimeout(playerTick, 1200);
        }
      } catch (e) {
        if (actionStatus) actionStatus.textContent = "Erreur réseau";
      }
    });

    musicLibraryList.appendChild(button);
  });
}

async function loadMusicLibrary() {
  if (!musicLibraryList) return;

  try {
    const res = await fetch("/music_files", { cache: "no-store" });
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.message || "Erreur dossier musique");
    }

    const files = data.files || [];

    if (musicLibraryCount) {
      musicLibraryCount.textContent = files.length ? `${files.length} son(s)` : "";
    }

    renderMusicLibrary(files);
    musicLibraryLoaded = true;
  } catch (e) {
    musicLibraryList.innerHTML = `<p class="small music-empty">Impossible de lire le dossier musique.</p>`;
  }
}

if (musicLibraryToggle && musicLibraryList) {
  musicLibraryToggle.addEventListener("click", async () => {
    musicLibraryList.classList.toggle("hidden");

    if (!musicLibraryLoaded) {
      await loadMusicLibrary();
    }
  });
}


// ===============================
// Config Pi : aperçu système
// ===============================

const systemOverviewButton = document.getElementById("systemOverviewButton");
const systemOverviewPanel = document.getElementById("systemOverviewPanel");

function percentBar(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="metric-bar" aria-hidden="true">
      <span style="width:${value}%"></span>
    </div>
  `;
}

function metricCard(label, value, sub, percent = null) {
  return `
    <article class="metric-card">
      <p>${label}</p>
      <strong>${value}</strong>
      ${sub ? `<small>${sub}</small>` : ""}
      ${percent !== null ? percentBar(percent) : ""}
    </article>
  `;
}

function renderSystemOverview(data) {
  if (!systemOverviewPanel) return;

  if (!data || !data.ok) {
    systemOverviewPanel.innerHTML = `<p class="small">Impossible de lire l’état système.</p>`;
    return;
  }

  const storage = data.storage || {};
  const wifi = data.wifi || {};
  const cpu = data.cpu || {};
  const ram = data.ram || {};

  const cpuValue =
    cpu.percent === null || cpu.percent === undefined
      ? "n/a"
      : `${cpu.percent}%`;

  const cpuSub =
    cpu.temperature === null || cpu.temperature === undefined
      ? ""
      : `${cpu.temperature}°C`;

  const ramValue =
    ram.percent === null || ram.percent === undefined
      ? "n/a"
      : `${ram.percent}%`;

  systemOverviewPanel.innerHTML = `
    <div class="metric-grid">
      ${metricCard(
        "Stockage",
        `${storage.percent || 0}%`,
        `${storage.used_label || "?"} utilisés · ${storage.free_label || "?"} libres`,
        storage.percent || 0
      )}

      ${metricCard(
        "Wi-Fi",
        wifi.quality || "indisponible",
        wifi.signal_dbm ? `${wifi.signal_dbm} dBm · ${wifi.ssid || wifi.interface || ""}` : (wifi.message || wifi.interface || ""),
        null
      )}

      ${metricCard(
        "CPU",
        cpuValue,
        cpuSub,
        cpu.percent
      )}

      ${metricCard(
        "RAM",
        ramValue,
        `${ram.used_label || "?"} utilisés · ${ram.available_label || "?"} libres`,
        ram.percent
      )}
    </div>
  `;
}

async function loadSystemOverview() {
  if (!systemOverviewPanel) return;

  systemOverviewPanel.classList.remove("hidden");
  systemOverviewPanel.innerHTML = `<p class="small">Lecture du système…</p>`;

  try {
    const res = await fetch("/system_overview", { cache: "no-store" });
    const data = await res.json();
    renderSystemOverview(data);
  } catch (e) {
    systemOverviewPanel.innerHTML = `<p class="small">Erreur de lecture système.</p>`;
  }
}

if (systemOverviewButton && systemOverviewPanel) {
  systemOverviewButton.addEventListener("click", loadSystemOverview);
}


// ===============================
// Config Pi : gestion playlists
// ===============================

const playlistManagerButton = document.getElementById("playlistManagerButton");
const playlistManagerPanel = document.getElementById("playlistManagerPanel");
const playlistList = document.getElementById("playlistList");
const playlistForm = document.getElementById("playlistForm");

let playlistsLoaded = false;

function renderPlaylists(items) {
  if (!playlistList) return;

  playlistList.innerHTML = "";

  if (!items || items.length === 0) {
    playlistList.innerHTML = `<p class="small">Aucune playlist configurée.</p>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "playlist-card";

    card.innerHTML = `
      <div class="playlist-card-main">
        <strong>${item.label || item.id}</strong>
        <small>${item.id} · ${item.output_dir || ""}</small>
      </div>
      <button class="secondary-action playlist-sync-button" type="button">Sync</button>
      <div class="playlist-files hidden" data-playlist-files="${item.id}"></div>
    `;

    const syncButton = card.querySelector(".playlist-sync-button");
    const filesPanel = card.querySelector(".playlist-files");

    card.addEventListener("click", async (event) => {
      if (event.target.closest(".playlist-sync-button")) return;

      if (!filesPanel) return;

      filesPanel.classList.toggle("hidden");

      if (filesPanel.dataset.loaded === "1") {
        return;
      }

      filesPanel.innerHTML = `<p class="small">Lecture du dossier…</p>`;

      try {
        const res = await fetch(`/playlist_files/${item.id}`, { cache: "no-store" });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.message || "Erreur fichiers playlist");
        }

        const files = data.files || [];

        if (files.length === 0) {
          filesPanel.innerHTML = `
            <p class="small playlist-empty">
              Aucun fichier audio local dans ce dossier.
            </p>
          `;
        } else {
          filesPanel.innerHTML = `
            <div class="playlist-files-meta">
              ${files.length} fichier(s) · ${data.output_dir || ""}
            </div>
            ${files.map((file) => `
              <div class="playlist-file-row">
                <span>${file.label || file.filename}</span>
                <small>${file.size_label || ""}</small>
              </div>
            `).join("")}
          `;
        }

        filesPanel.dataset.loaded = "1";
      } catch (e) {
        filesPanel.innerHTML = `<p class="small playlist-empty">Impossible de lire le dossier.</p>`;
      }
    });


    syncButton.addEventListener("click", async () => {
      syncButton.disabled = true;
      syncButton.textContent = "Sync…";

      try {
        const res = await fetch(`/sync_playlist/${item.id}`, { method: "POST" });
        const json = await res.json();

        if (actionStatus) {
          actionStatus.textContent = json.message || "Synchronisation lancée";
        }

        syncButton.textContent = "Lancée";
      } catch (e) {
        syncButton.textContent = "Erreur";
        if (actionStatus) actionStatus.textContent = "Erreur sync playlist";
      } finally {
        setTimeout(() => {
          syncButton.disabled = false;
          syncButton.textContent = "Sync";
        }, 2500);
      }
    });

    playlistList.appendChild(card);
  });
}

async function loadPlaylists() {
  if (!playlistList) return;

  playlistList.innerHTML = `<p class="small">Lecture des playlists…</p>`;

  try {
    const res = await fetch("/playlists", { cache: "no-store" });
    const data = await res.json();

    if (!data.ok) {
      throw new Error("Erreur playlists");
    }

    renderPlaylists(data.playlists || []);
    playlistsLoaded = true;
  } catch (e) {
    playlistList.innerHTML = `<p class="small">Impossible de lire les playlists.</p>`;
  }
}

if (playlistManagerButton && playlistManagerPanel) {
  playlistManagerButton.addEventListener("click", async () => {
    playlistManagerPanel.classList.toggle("hidden");

    if (!playlistsLoaded) {
      await loadPlaylists();
    }
  });
}

if (playlistForm) {
  playlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = new FormData(playlistForm);

    if (actionStatus) {
      actionStatus.textContent = "Enregistrement…";
    }

    try {
      const res = await fetch("/playlists", {
        method: "POST",
        body: data,
      });

      const json = await res.json();

      if (actionStatus) {
        actionStatus.textContent = json.message || (json.ok ? "Playlist enregistrée" : "Erreur");
      }

      if (json.ok) {
        playlistForm.reset();
        await loadPlaylists();
      }
    } catch (e) {
      if (actionStatus) {
        actionStatus.textContent = "Erreur réseau";
      }
    }
  });
}


// ===============================
// Lecteur : navigateur dossier musique
// ===============================

let musicBrowserCurrentPath = "";

function musicBrowserTitle(path) {
  if (!path) return "Dossier musique";
  return path;
}

function formatMusicSize(bytes) {
  const value = Number(bytes || 0);

  if (value <= 0) return "";

  const units = ["o", "Ko", "Mo", "Go"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size = size / 1024;
    index += 1;
  }

  return index === 0 ? `${Math.round(size)} ${units[index]}` : `${size.toFixed(1)} ${units[index]}`;
}

// Surcharge volontaire de loadMusicLibrary.
// L'ancien lecteur plat /music_files reste disponible côté API,
// mais l'interface utilise maintenant /music_browser.
async function loadMusicLibrary(path = "") {
  if (!musicLibraryList) return;

  musicBrowserCurrentPath = path || "";
  musicLibraryList.innerHTML = `<p class="small music-empty">Lecture du dossier…</p>`;

  try {
    const res = await fetch(`/music_browser?path=${encodeURIComponent(musicBrowserCurrentPath)}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.message || "Erreur dossier musique");
    }

    const dirs = data.dirs || [];
    const files = data.files || [];

    if (musicLibraryCount) {
      const count = dirs.length + files.length;
      musicLibraryCount.textContent = count ? `${count} élément(s)` : "";
    }

    musicLibraryList.innerHTML = "";

    const header = document.createElement("div");
    header.className = "music-browser-header";

    header.innerHTML = `
      <span>${musicBrowserTitle(data.path || "")}</span>
      ${data.path ? `<button type="button" class="music-browser-back">← Retour</button>` : ""}
    `;

    const backButton = header.querySelector(".music-browser-back");

    if (backButton) {
      backButton.addEventListener("click", () => {
        loadMusicLibrary(data.parent || "");
      });
    }

    musicLibraryList.appendChild(header);

    if (dirs.length === 0 && files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "small music-empty";
      empty.textContent = "Dossier vide.";
      musicLibraryList.appendChild(empty);
      musicLibraryLoaded = true;
      return;
    }

    dirs.forEach((folder) => {
      const button = document.createElement("button");
      button.className = "music-folder-choice";
      button.type = "button";

      button.innerHTML = `
        <span>📁 ${folder.label}</span>
        <small>${folder.path}</small>
      `;

      button.addEventListener("click", () => {
        loadMusicLibrary(folder.path);
      });

      musicLibraryList.appendChild(button);
    });

    files.forEach((file) => {
      const button = document.createElement("button");
      button.className = "music-file-choice";
      button.type = "button";
      button.dataset.path = file.path;

      button.innerHTML = `
        <span>${file.label || file.filename}</span>
        <small>${file.filename}${file.size ? ` · ${formatMusicSize(file.size)}` : ""}</small>
      `;

      button.addEventListener("click", async () => {
        const formData = new FormData();
        formData.append("path", file.path);

        if (actionStatus) actionStatus.textContent = "Lancement…";

        try {
          const res = await fetch("/play_file", {
            method: "POST",
            body: formData,
          });

          const json = await res.json();

          if (actionStatus) {
            actionStatus.textContent = json.message || (json.ok ? "Lecture lancée" : "Erreur");
          }

          if (json.ok) {
            musicLibraryList.classList.add("hidden");
            setTimeout(playerTick, 1200);
          }
        } catch (e) {
          if (actionStatus) actionStatus.textContent = "Erreur réseau";
        }
      });

      musicLibraryList.appendChild(button);
    });

    musicLibraryLoaded = true;
  } catch (e) {
    musicLibraryList.innerHTML = `<p class="small music-empty">Impossible de lire le dossier musique.</p>`;
  }
}


// ===============================
// Anti-veille
// ===============================

const sleepDashboard = document.getElementById("sleepDashboard");
const sleepInlineEditor = document.getElementById("sleepInlineEditor");
const sleepSettingsToggle = document.getElementById("sleepSettingsToggle");
const sleepSettingsContent = document.getElementById("sleepSettingsContent");

const sleepForm = document.getElementById("sleepForm");
const sleepTime = document.getElementById("sleepTime");
const sleepSource = document.getElementById("sleepSource");
const sleepSourceBadge = document.getElementById("sleepSourceBadge");
const sleepPlaylistOptions = document.getElementById("sleepPlaylistOptions");
const sleepRadioOptions = document.getElementById("sleepRadioOptions");

const sleepDuration = document.getElementById("sleepDuration");
const sleepFadeEnabled = document.getElementById("sleepFadeEnabled");
const sleepFadePanel = document.getElementById("sleepFadePanel");
const sleepFadeCurveInput = document.getElementById("sleepFadeCurve");

const sleepDurationChoices = document.querySelectorAll(".sleep-duration-choice");
const sleepCurveChoices = document.querySelectorAll(".sleep-curve-choice");

let sleepAutosaveTimer = null;
let sleepIsLoading = false;

function formatSleepSourceLabel(value) {
  if (typeof formatAlarmModeLabel === "function") {
    return formatAlarmModeLabel(
      value || "random",
      window.__radioStations || {},
      window.__playlists || []
    );
  }

  if (!value || value === "random") return "Aléatoire — Réveil";
  if (value === "playlist") return "Playlist — Réveil";
  if (value.startsWith("radio:")) return `Radio — ${value.split(":")[1] || ""}`;
  if (value.startsWith("random:")) return `Aléatoire — ${value.split(":")[1] || ""}`;
  if (value.startsWith("playlist:")) return `Playlist — ${value.split(":")[1] || ""}`;

  return value;
}

function durationLabelFromSeconds(seconds) {
  const minutes = Math.round(Number(seconds || 900) / 60);
  return `${minutes} min`;
}

function activeSleepCurveLabel() {
  const active = document.querySelector(".sleep-curve-choice.active");
  const label = active ? active.querySelector("strong") : null;
  return label ? label.textContent.trim() : "Arrivée douce";
}

function refreshSleepFadeVisibility() {
  if (!sleepFadeEnabled || !sleepFadePanel) return;
  sleepFadePanel.classList.toggle("hidden", !sleepFadeEnabled.checked);
}

function refreshSleepPreview(status = null) {
  if (!dashboardTime || !dashboardSub) return;

  const time = status ? status.sleep_time : (sleepTime ? sleepTime.value : "23:00");
  const source = status ? status.sleep_source : (sleepSource ? sleepSource.value : "random");
  const duration = status ? status.duration : (sleepDuration ? sleepDuration.value : "900");
  const fadeEnabled = status ? status.fade_enabled === "1" : (!sleepFadeEnabled || sleepFadeEnabled.checked);
  const until = status ? status.time_until : "";

  dashboardTime.textContent = time || "23:00";

  if (sleepSourceBadge) {
    sleepSourceBadge.textContent = formatSleepSourceLabel(source);
  }

  if (until) {
    dashboardSub.textContent = until;
  } else if (fadeEnabled) {
    dashboardSub.textContent = `Fade out ${durationLabelFromSeconds(duration)} · ${activeSleepCurveLabel()}`;
  } else {
    dashboardSub.textContent = `Stop direct après ${durationLabelFromSeconds(duration)}`;
  }

  refreshSleepFadeVisibility();
}

function applySleepStatus(status) {
  if (!status || !status.ok) return;

  sleepIsLoading = true;

  if (sleepTime) sleepTime.value = status.sleep_time || "23:00";
  if (sleepSource) sleepSource.value = status.sleep_source || "random";
  if (sleepDuration) sleepDuration.value = status.duration || "900";

  if (sleepFadeEnabled) {
    sleepFadeEnabled.checked = status.fade_enabled === "1";
  }

  if (sleepFadeCurveInput) {
    sleepFadeCurveInput.value = status.curve || "ease_out";
  }

  sleepDurationChoices.forEach((button) => {
    button.classList.toggle("active", button.dataset.duration === (status.duration || "900"));
  });

  sleepCurveChoices.forEach((button) => {
    button.classList.toggle("active", button.dataset.curve === (status.curve || "ease_out"));
  });

  refreshSleepPreview(status);

  sleepIsLoading = false;
}

async function loadSleepStatus() {
  if (!sleepForm) return;

  try {
    const res = await fetch("/sleep_status", { cache: "no-store" });
    const data = await res.json();
    applySleepStatus(data);
  } catch (e) {
    console.error("sleep status error", e);
  }
}

function sleepFormData() {
  const data = new FormData(sleepForm);

  if (!sleepFadeEnabled || !sleepFadeEnabled.checked) {
    data.set("fade_enabled", "0");
  } else {
    data.set("fade_enabled", "1");
  }

  if (sleepDuration) {
    data.set("duration", sleepDuration.value || "900");
  }

  if (sleepFadeCurveInput) {
    data.set("fade_curve", sleepFadeCurveInput.value || "ease_out");
  }

  return data;
}

async function saveSleepSettings() {
  if (!sleepForm || sleepIsLoading) return;

  if (actionStatus) {
    actionStatus.textContent = "Sauvegarde anti-veille…";
  }

  try {
    const res = await fetch("/sleep_start", {
      method: "POST",
      body: sleepFormData(),
    });

    const json = await res.json();

    if (actionStatus) {
      actionStatus.textContent = json.message || (json.ok ? "Paramètres anti-veille sauvegardés" : "Erreur");
    }

    if (json.ok) {
      await loadSleepStatus();
    }
  } catch (e) {
    if (actionStatus) {
      actionStatus.textContent = "Erreur sauvegarde anti-veille";
    }
  }
}

function scheduleSleepAutosave() {
  if (sleepIsLoading) return;

  refreshSleepPreview();

  if (sleepAutosaveTimer) {
    clearTimeout(sleepAutosaveTimer);
  }

  sleepAutosaveTimer = setTimeout(saveSleepSettings, 350);
}

function buildSleepSourceOptions(stations, playlists = []) {
  if (!sleepSource) return;

  const current = sleepSource.value || "random";

  if (sleepPlaylistOptions) {
    sleepPlaylistOptions.innerHTML = "";

    const normalizedPlaylists =
      Array.isArray(playlists) && playlists.length > 0
        ? playlists
        : [{ id: "reveil", label: "Réveil" }];

    normalizedPlaylists.forEach((playlist) => {
      const id = playlist.id || "reveil";
      const label = playlist.label || id;

      [
        [id === "reveil" ? "random" : `random:${id}`, `Aléatoire — ${label}`],
        [id === "reveil" ? "playlist" : `playlist:${id}`, `Playlist — ${label}`],
      ].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;

        if (current === value) {
          option.selected = true;
        }

        sleepPlaylistOptions.appendChild(option);
      });
    });
  }

  if (sleepRadioOptions) {
    sleepRadioOptions.innerHTML = "";

    Object.entries(stations || {}).forEach(([id, station]) => {
      const option = document.createElement("option");
      option.value = `radio:${id}`;
      option.textContent = `Radio — ${station.label || id}`;

      if (current === option.value) {
        option.selected = true;
      }

      sleepRadioOptions.appendChild(option);
    });
  }

  refreshSleepPreview();
}

async function loadSleepSources() {
  if (!sleepSource) return;

  try {
    const [radioRes, playlistsRes] = await Promise.all([
      fetch("/radio_stations", { cache: "no-store" }),
      fetch("/playlists", { cache: "no-store" }),
    ]);

    const radioData = await radioRes.json();
    const playlistsData = await playlistsRes.json();

    const stations = radioData.ok ? (radioData.stations || {}) : {};
    const playlists = playlistsData.ok ? (playlistsData.playlists || []) : [];

    window.__radioStations = stations;
    window.__playlists = playlists;

    buildSleepSourceOptions(stations, playlists);
    await loadSleepStatus();
  } catch (e) {
    console.error("sleep sources error", e);
  }
}

function toggleSleepEditor() {
  if (!sleepInlineEditor) return;
  sleepInlineEditor.classList.toggle("hidden");
}

if (sleepDashboard && sleepInlineEditor) {
  sleepDashboard.addEventListener("click", (event) => {
    if (event.target.closest("#sleepInlineEditor")) return;
    if (event.target.closest(".js-stop-form")) return;
    toggleSleepEditor();
  });

  sleepDashboard.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleSleepEditor();
  });
}

if (sleepSettingsToggle && sleepSettingsContent) {
  sleepSettingsToggle.addEventListener("click", () => {
    sleepSettingsContent.classList.toggle("hidden");
  });
}

if (sleepDurationChoices.length && sleepDuration) {
  sleepDurationChoices.forEach((button) => {
    button.addEventListener("click", () => {
      sleepDuration.value = button.dataset.duration || "900";

      sleepDurationChoices.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      scheduleSleepAutosave();
    });
  });
}

if (sleepCurveChoices.length && sleepFadeCurveInput) {
  sleepCurveChoices.forEach((button) => {
    button.addEventListener("click", () => {
      sleepFadeCurveInput.value = button.dataset.curve || "ease_out";

      sleepCurveChoices.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      scheduleSleepAutosave();
    });
  });
}

if (sleepForm) {
  loadSleepSources();
  refreshSleepPreview();
  refreshSleepFadeVisibility();

  [sleepTime, sleepSource].forEach((element) => {
    if (element) {
      element.addEventListener("change", scheduleSleepAutosave);
      element.addEventListener("input", scheduleSleepAutosave);
    }
  });

  if (sleepFadeEnabled) {
    sleepFadeEnabled.addEventListener("change", scheduleSleepAutosave);
  }

  sleepForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSleepSettings();
  });
}


// ===============================
// Waveform visible dans le module actif
// ===============================

function currentModuleNameForWaveform() {
  if (document.body.classList.contains("page-alarm")) return "alarm";
  if (document.body.classList.contains("page-sleep")) return "sleep";
  if (document.body.classList.contains("page-radio")) return "radio";
  if (document.body.classList.contains("page-player")) return "player";
  return "";
}

function playbackBelongsToCurrentModule(data) {
  if (!data || !["playing", "fading"].includes(data.status)) return false;

  const moduleName = currentModuleNameForWaveform();

  if (moduleName === "alarm") {
    return data.context === "alarm";
  }

  if (moduleName === "sleep") {
    return data.context === "sleep";
  }

  if (moduleName === "radio") {
    return data.mode === "radio" && data.context !== "alarm" && data.context !== "sleep";
  }

  if (moduleName === "player") {
    return ["youtube", "local"].includes(data.mode) && data.context !== "alarm" && data.context !== "sleep";
  }

  return false;
}

function setModuleWaveformVisible(visible) {
  const waveform = document.getElementById("liveWaveform");
  if (!waveform) return;

  waveform.classList.toggle("hidden", !visible);
}

function updateModuleWaveformBars(level) {
  const waveform = document.getElementById("liveWaveform");
  if (!waveform) return;

  const bars = waveform.querySelectorAll("i");
  if (!bars.length) return;

  const safeLevel = Math.max(0, Math.min(1, Number(level) || 0));

  bars.forEach((bar, index) => {
    const phase = Math.sin(Date.now() / 180 + index * 0.9);
    const height = 22 + safeLevel * 46 + phase * safeLevel * 18;
    bar.style.height = `${Math.max(12, Math.min(72, height))}%`;
    bar.style.opacity = `${0.35 + safeLevel * 0.65}`;
  });
}

async function pollModuleWaveform() {
  const waveform = document.getElementById("liveWaveform");
  if (!waveform) return;

  try {
    const statusRes = await fetch("/status", { cache: "no-store" });
    const status = await statusRes.json();

    const visible = playbackBelongsToCurrentModule(status);
    setModuleWaveformVisible(visible);

    if (!visible) return;

    const waveformRes = await fetch("/waveform", { cache: "no-store" });
    const waveformData = await waveformRes.json();

    if (waveformData && waveformData.ok !== false) {
      updateModuleWaveformBars(waveformData.level || 0.25);
    } else {
      updateModuleWaveformBars(0.18);
    }
  } catch (e) {
    setModuleWaveformVisible(false);
  }
}

if (document.getElementById("liveWaveform")) {
  pollModuleWaveform();
  setInterval(pollModuleWaveform, 750);
}
