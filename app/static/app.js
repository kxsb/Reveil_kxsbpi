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

document.querySelectorAll("form[action]").forEach((form) => {
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

    if (alarmTime && data.alarm_time) {
      alarmTime.value = data.alarm_time;
    }

    if (alarmMode && data.alarm_mode) {
      alarmMode.value = data.alarm_mode;
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

const radioToggle = document.getElementById("radioToggle");
const radioMenu = document.getElementById("radioMenu");

if (radioToggle && radioMenu) {
  radioToggle.addEventListener("click", () => {
    radioMenu.classList.toggle("hidden");
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

async function updateStatus() {
  try {
    const res = await fetch("/status");
    const data = await res.json();

    if (data.status === "fading") {
      fadeGraph.classList.remove("hidden");

      const label = data.source_label || "Réveil";

      dashboardLabel.textContent = "🌅 Réveil en cours";
      dashboardTime.textContent = label;
      dashboardSub.textContent = "Montée progressive";

      const elapsed = data.now - data.started_at;
      const progress = Math.min(elapsed / data.fade_duration, 1);
      const p = getCurvePoint(progress, data.fade_curve);

      const x = progress * 100;
      const y = 60 - p * 50;

      fadeCurvePath.setAttribute("d", buildCurvePath(data.fade_curve));
      fadeDot.setAttribute("cx", x);
      fadeDot.setAttribute("cy", y);

      fadeGraphLabel.textContent =
        Math.round(p * (data.max_volume - data.initial_volume) + parseInt(data.initial_volume)) + "%";

      return;
    }

    if (data.status === "playing") {
      fadeGraph.classList.add("hidden");

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

        if (data.station_id) {
          updateRadioNow(data.station_id);
        }

      } else {
        dashboardSub.textContent = "Fade terminé";
      }

      return;
    }

    resetDashboard();

  } catch (e) {
    console.error("status error", e);
  }
}

setInterval(() => {
  fetch("/status")
    .then(res => res.json())
    .then(data => {
      if (data.status === "playing" && data.mode === "radio" && data.station_id) {
        updateRadioNow(data.station_id);
      }
    })
    .catch(() => {});
}, 10000);

refreshAlarmStatus();
updateStatus();

setInterval(refreshAlarmStatus, 60000);
setInterval(updateStatus, 3000);
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

// Surveille le statut pour l'accueil et les boutons Stop
async function refreshPlaybackUx() {
  try {
    const res = await fetch("/status");
    const data = await res.json();
    updatePlaybackUx(data);
  } catch (e) {
    console.error("playback ux error", e);
  }
}

refreshPlaybackUx();
setInterval(refreshPlaybackUx, 3000);
