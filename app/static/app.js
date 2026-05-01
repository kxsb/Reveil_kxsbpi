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

function resetDashboard() {
  if (!dashboardLabel || !dashboardTime || !dashboardSub || !fadeGraph) return;

  fadeGraph.classList.add("hidden");
  dashboardLabel.textContent = "Prochain réveil";
  dashboardTime.textContent = dashboardTime.dataset.default || "";
  dashboardSub.textContent = dashboardSub.dataset.default || "";
}

async function updateStatus() {
  try {
    const res = await fetch("/status");
    const data = await res.json();

    if (data.status === "fading") {
      fadeGraph.classList.remove("hidden");

      dashboardLabel.textContent = "🌅 Réveil en cours";
      dashboardTime.textContent = "Fade in";

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
      dashboardLabel.textContent = "🎧 Lecture en cours";
      dashboardTime.textContent = "Playlist";
      dashboardSub.textContent = "Fade terminé";
      return;
    }

    resetDashboard();

  } catch (e) {
    console.error("status error", e);
  }
}

updateStatus();
setInterval(updateStatus, 1500);