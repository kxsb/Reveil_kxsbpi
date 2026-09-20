import './style.css'

import {
  apiRequest,
  getServer,
  setServer,
} from './api.js'

const app = document.querySelector('#app')

let connected = false
let playerPoll = null

const STATUS_LABELS = {
  stopped: 'Arrêté',
  starting: 'Démarrage…',
  playing: 'Lecture',
  paused: 'Pause',
  fading: 'Fondu',
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function api(method, path, data) {
  const response = await apiRequest(method, path, data)
  return response.data ?? {}
}

function clearPoll() {
  if (playerPoll) {
    clearInterval(playerPoll)
    playerPoll = null
  }
}

async function checkConnection() {
  try {
    await api('GET', '/health')
    connected = true
  } catch {
    connected = false
  }

  return connected
}

function navigate(route) {
  clearPoll()
  window.location.hash = route
}

function bindNavigation() {
  document
    .querySelectorAll('[data-route]')
    .forEach(element => {
      element.addEventListener('click', () => {
        navigate(element.dataset.route)
      })
    })
}

function header(title, back = 'home') {
  return `
    <header class="screen-header">
      <button
        class="back-button"
        data-route="${esc(back)}"
        aria-label="Retour"
      >
        ‹
      </button>

      <div class="screen-title">
        ${esc(title)}
      </div>

      <div class="lan-pill ${connected ? 'online' : 'offline'}">
        ${connected ? 'LAN' : 'OFF'}
      </div>
    </header>
  `
}

function loading(title, back = 'home') {
  app.innerHTML = `
    <main class="app-shell">
      ${header(title, back)}

      <section class="detail-card">
        <div class="loading-text">
          Chargement…
        </div>
      </section>
    </main>
  `

  bindNavigation()
}

function errorCard(message) {
  return `
    <div class="error-box">
      ${esc(message)}
    </div>
  `
}

/* ================================================================
   ACCUEIL
   ================================================================ */

function renderHome() {
  clearPoll()

  app.innerHTML = `
    <main class="app-shell home-screen">
      <div class="home-top">
        <div></div>

        <div class="lan-pill ${connected ? 'online' : 'offline'}">
          ${connected ? 'LAN' : 'OFF'}
        </div>
      </div>

      <section class="home-menu">
        <button class="home-card" data-route="alarm">
          <div class="home-icon">⏰</div>
          <div class="home-label">Réveil</div>
        </button>

        <button class="home-card" data-route="sleep">
          <div class="home-icon">🌙</div>
          <div class="home-label">Anti-veille</div>
        </button>

        <button class="home-card disabled" disabled>
          <div class="home-icon dimmed">💡</div>
          <div class="home-label dimmed">Lumière</div>
        </button>

        <button
          class="home-card player-highlight"
          data-route="player"
        >
          <div class="home-icon waveform-icon">〰</div>
          <div class="home-label">Lecteur</div>
        </button>

        <button class="home-card" data-route="config">
          <div class="home-icon">⚙️</div>
          <div class="home-label">Config Pi</div>
        </button>
      </section>

      <footer class="home-footer">
        tu peux toujours rêver
      </footer>
    </main>
  `

  bindNavigation()
}

/* ================================================================
   SOURCES
   ================================================================ */

async function loadSources(current = '') {
  const [radioData, playlistData] = await Promise.all([
    api('GET', '/radios'),
    api('GET', '/playlists'),
  ])

  const stations = radioData.stations || {}
  const playlists = playlistData.playlists || []

  const options = []

  for (const [id, station] of Object.entries(stations)) {
    options.push({
      value: `radio:${id}`,
      label: `Radio · ${station.label || id}`,
    })
  }

  for (const playlist of playlists) {
    if (playlist.id === 'reveil') {
      options.push({
        value: 'random',
        label: `${playlist.label} · aléatoire`,
      })

      options.push({
        value: 'playlist',
        label: `${playlist.label} · dans l'ordre`,
      })
    } else {
      options.push({
        value: `random:${playlist.id}`,
        label: `${playlist.label} · aléatoire`,
      })

      options.push({
        value: `playlist:${playlist.id}`,
        label: `${playlist.label} · dans l'ordre`,
      })
    }
  }

  if (
    current &&
    !options.some(option => option.value === current)
  ) {
    options.unshift({
      value: current,
      label: current,
    })
  }

  return options
}

function optionHtml(options, current) {
  return options
    .map(option => `
      <option
        value="${esc(option.value)}"
        ${option.value === current ? 'selected' : ''}
      >
        ${esc(option.label)}
      </option>
    `)
    .join('')
}

/* ================================================================
   REVEIL
   ================================================================ */

async function renderAlarm() {
  loading('Réveil')

  try {
    const alarm = await api('GET', '/alarm')
    const sources = await loadSources(alarm.mode)

    const settings = {
      fade_enabled:
        alarm.settings?.fade_enabled !== false,

      initial_volume:
        Number(alarm.settings?.initial_volume ?? 10),

      max_volume:
        Number(alarm.settings?.max_volume ?? 80),

      fade_duration:
        Number(alarm.settings?.fade_duration ?? 120),

      fade_curve:
        alarm.settings?.fade_curve || 'linear',
    }

    const active = (current, value) =>
      String(current) === String(value)
        ? 'active'
        : ''

    app.innerHTML = `
      <main class="app-shell">
        ${header('Réveil')}

        <section class="detail-card">
          <div class="detail-eyebrow">
            Prochain réveil
          </div>

          <div class="big-status">
            ${esc(alarm.next_alarm)}
          </div>

          <label
            class="field-label"
            for="alarmTime"
          >
            Heure
          </label>

          <input
            id="alarmTime"
            class="text-input time-input"
            type="time"
            value="${esc(alarm.time || '07:30')}"
          >

          <label
            class="field-label"
            for="alarmSource"
          >
            Source
          </label>

          <select
            id="alarmSource"
            class="text-input select-input"
          >
            ${optionHtml(sources, alarm.mode)}
          </select>
        </section>

        <section class="detail-card alarm-advanced-card">
          <div class="detail-eyebrow">
            Montée progressive
          </div>

          <label class="toggle-row">
            <span>
              Fondu automatique
              <small class="alarm-setting-caption">
                Le volume manuel interrompt la courbe
              </small>
            </span>

            <input
              id="alarmFadeEnabled"
              type="checkbox"
              ${settings.fade_enabled ? 'checked' : ''}
            >
          </label>

          <div id="alarmFadeOptions">
            <label class="field-label">
              Durée de montée
            </label>

            <div
              class="alarm-choice-grid"
              data-alarm-setting="fadeDuration"
            >
              <button
                type="button"
                class="alarm-choice ${active(settings.fade_duration, 60)}"
                data-value="60"
              >
                1 min
              </button>

              <button
                type="button"
                class="alarm-choice ${active(settings.fade_duration, 120)}"
                data-value="120"
              >
                2 min
              </button>

              <button
                type="button"
                class="alarm-choice ${active(settings.fade_duration, 300)}"
                data-value="300"
              >
                5 min
              </button>
            </div>

            <label class="field-label">
              Volume de départ
            </label>

            <div
              class="alarm-choice-grid"
              data-alarm-setting="initialVolume"
            >
              <button
                type="button"
                class="alarm-choice ${active(settings.initial_volume, 10)}"
                data-value="10"
              >
                10 %
              </button>

              <button
                type="button"
                class="alarm-choice ${active(settings.initial_volume, 20)}"
                data-value="20"
              >
                20 %
              </button>

              <button
                type="button"
                class="alarm-choice ${active(settings.initial_volume, 30)}"
                data-value="30"
              >
                30 %
              </button>
            </div>

            <label class="field-label">
              Courbe de montée
            </label>

            <div
              class="alarm-curve-grid"
              data-alarm-setting="fadeCurve"
            >
              <button
                type="button"
                class="alarm-choice alarm-curve-choice ${active(settings.fade_curve, 'linear')}"
                data-value="linear"
              >
                <svg viewBox="0 0 100 60">
                  <path d="M10 50 L90 10"></path>
                </svg>
                <span>Linéaire</span>
              </button>

              <button
                type="button"
                class="alarm-choice alarm-curve-choice ${active(settings.fade_curve, 'ease_in')}"
                data-value="ease_in"
              >
                <svg viewBox="0 0 100 60">
                  <path d="M10 50 C45 50 70 40 90 10"></path>
                </svg>
                <span>Départ doux</span>
              </button>

              <button
                type="button"
                class="alarm-choice alarm-curve-choice ${active(settings.fade_curve, 'ease_out')}"
                data-value="ease_out"
              >
                <svg viewBox="0 0 100 60">
                  <path d="M10 50 C25 20 55 10 90 10"></path>
                </svg>
                <span>Arrivée douce</span>
              </button>

              <button
                type="button"
                class="alarm-choice alarm-curve-choice ${active(settings.fade_curve, 'ease_in_out')}"
                data-value="ease_in_out"
              >
                <svg viewBox="0 0 100 60">
                  <path d="M10 50 C30 50 35 10 90 10"></path>
                </svg>
                <span>Progressive</span>
              </button>
            </div>

            <div class="alarm-target-volume">
              Volume cible : ${settings.max_volume} %
            </div>
          </div>
        </section>

        <button
          id="saveAlarm"
          class="large-button"
        >
          Enregistrer le réveil
        </button>

        <div
          id="alarmMessage"
          class="connection-message"
        ></div>
      </main>
    `

    bindNavigation()

    const fadeCheckbox =
      document.querySelector('#alarmFadeEnabled')

    const fadeOptions =
      document.querySelector('#alarmFadeOptions')

    const updateFadeVisibility = () => {
      fadeOptions.hidden = !fadeCheckbox.checked
    }

    updateFadeVisibility()

    fadeCheckbox.addEventListener(
      'change',
      updateFadeVisibility,
    )

    document
      .querySelectorAll('[data-alarm-setting]')
      .forEach(group => {
        group.addEventListener('click', event => {
          const button =
            event.target.closest(
              'button[data-value]',
            )

          if (!button || !group.contains(button)) {
            return
          }

          group
            .querySelectorAll('button[data-value]')
            .forEach(item => {
              item.classList.remove('active')
            })

          button.classList.add('active')
        })
      })

    const selectedValue = setting =>
      document.querySelector(
        `[data-alarm-setting="${setting}"] ` +
        'button.active',
      )?.dataset.value

    document
      .querySelector('#saveAlarm')
      .addEventListener('click', async () => {
        const message =
          document.querySelector('#alarmMessage')

        message.textContent = 'Enregistrement…'

        try {
          const result = await api(
            'PUT',
            '/alarm',
            {
              time:
                document
                  .querySelector('#alarmTime')
                  .value,

              mode:
                document
                  .querySelector('#alarmSource')
                  .value,

              settings: {
                fade_enabled:
                  fadeCheckbox.checked,

                fade_duration:
                  Number(
                    selectedValue('fadeDuration')
                    || 120,
                  ),

                initial_volume:
                  Number(
                    selectedValue('initialVolume')
                    || 10,
                  ),

                fade_curve:
                  selectedValue('fadeCurve')
                  || 'linear',
              },
            },
          )

          message.className =
            'connection-message success'

          message.textContent =
            `Enregistré · ${result.next_alarm}`

        } catch (error) {
          message.className =
            'connection-message failure'

          message.textContent = error.message
        }
      })

  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${header('Réveil')}
        ${errorCard(error.message)}
      </main>
    `

    bindNavigation()
  }
}

/* ================================================================
   ANTI-VEILLE
   ================================================================ */

async function renderSleep() {
  loading('Anti-veille')

  try {
    const sleep = await api('GET', '/sleep')
    const sources = await loadSources(sleep.sleep_source)

    app.innerHTML = `
      <main class="app-shell">
        ${header('Anti-veille')}

        <section class="detail-card">
          <div class="detail-eyebrow">
            Prochaine extinction
          </div>

          <div class="big-status">
            ${esc(sleep.time_until)}
          </div>

          <label class="field-label" for="sleepTime">
            Heure
          </label>

          <input
            id="sleepTime"
            class="text-input time-input"
            type="time"
            value="${esc(sleep.sleep_time)}"
          >

          <label class="field-label" for="sleepSource">
            Source
          </label>

          <select
            id="sleepSource"
            class="text-input select-input"
          >
            ${optionHtml(sources, sleep.sleep_source)}
          </select>

          <div class="field-label">
            Durée
          </div>

          <div class="choice-row" id="durationChoices">
            ${[
              ['900', '15 min'],
              ['2100', '35 min'],
              ['3000', '50 min'],
            ].map(([value, label]) => `
              <button
                class="choice-button
                ${sleep.duration === value ? 'selected' : ''}"
                data-duration="${value}"
              >
                ${label}
              </button>
            `).join('')}
          </div>

          <label class="toggle-row">
            <span>Fondu progressif</span>

            <input
              id="fadeEnabled"
              type="checkbox"
              ${sleep.fade_enabled === '1' ? 'checked' : ''}
            >
          </label>

          <label class="field-label" for="sleepCurve">
            Courbe du fondu
          </label>

          <select
            id="sleepCurve"
            class="text-input select-input"
          >
            <option value="linear"
              ${sleep.curve === 'linear' ? 'selected' : ''}>
              Linéaire
            </option>

            <option value="ease_in"
              ${sleep.curve === 'ease_in' ? 'selected' : ''}>
              Douce au début
            </option>

            <option value="ease_out"
              ${sleep.curve === 'ease_out' ? 'selected' : ''}>
              Douce à la fin
            </option>

            <option value="ease_in_out"
              ${sleep.curve === 'ease_in_out' ? 'selected' : ''}>
              Douce début et fin
            </option>
          </select>

          <button
            id="saveSleep"
            class="large-button"
          >
            Enregistrer l'anti-veille
          </button>

          <div
            id="sleepMessage"
            class="connection-message"
          ></div>
        </section>
      </main>
    `

    bindNavigation()

    let duration = sleep.duration

    document
      .querySelectorAll('[data-duration]')
      .forEach(button => {
        button.addEventListener('click', () => {
          duration = button.dataset.duration

          document
            .querySelectorAll('[data-duration]')
            .forEach(item => {
              item.classList.toggle(
                'selected',
                item === button,
              )
            })
        })
      })

    document
      .querySelector('#saveSleep')
      .addEventListener('click', async () => {
        const message =
          document.querySelector('#sleepMessage')

        message.textContent = 'Enregistrement…'

        try {
          const result = await api(
            'PUT',
            '/sleep',
            {
              time:
                document.querySelector('#sleepTime').value,

              source:
                document.querySelector('#sleepSource').value,

              fade_enabled:
                document.querySelector('#fadeEnabled').checked
                  ? '1'
                  : '0',

              duration,

              curve:
                document.querySelector('#sleepCurve').value,
            },
          )

          message.className =
            'connection-message success'

          message.textContent =
            `Enregistré · ${result.time_until}`
        } catch (error) {
          message.className =
            'connection-message failure'

          message.textContent = error.message
        }
      })
  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${header('Anti-veille')}
        ${errorCard(error.message)}
      </main>
    `

    bindNavigation()
  }
}

/* ================================================================
   LECTEUR
   ================================================================ */

function playerMenu() {
  return `
    <section class="section-menu">
      <button class="section-button" data-route="radios">
        <span class="section-icon">📻</span>
        <span>Radios</span>
        <span class="chevron">›</span>
      </button>

      <button class="section-button" data-route="playlists">
        <span class="section-icon">🎵</span>
        <span>Playlists</span>
        <span class="chevron">›</span>
      </button>

      <button class="section-button" data-route="youtube">
        <span class="section-icon">▶</span>
        <span>YouTube</span>
        <span class="chevron">›</span>
      </button>
    </section>
  `
}

async function refreshPlayer() {
  try {
    const state = await api('GET', '/player/status')
    connected = true

    const runtime = state.runtime || {}

    const status =
      document.querySelector('#playerStatus')

    if (!status) return

    status.textContent =
      STATUS_LABELS[state.status] ||
      state.status ||
      '—'

    document.querySelector('#mediaTitle').textContent =
      runtime.media_title || 'Aucun média'

    const details = []

    if (
      runtime.playlist_index != null &&
      runtime.playlist_count
    ) {
      details.push(
        `${runtime.playlist_index}/${runtime.playlist_count}`,
      )
    }

    if (runtime.volume != null) {
      details.push(
        `Volume ${Math.round(runtime.volume)}%`,
      )
    }

    document.querySelector('#mediaMeta').textContent =
      details.join(' · ')

    const progress =
      runtime.duration_seconds > 0
        ? Math.min(
            100,
            Math.max(
              0,
              runtime.position_seconds /
                runtime.duration_seconds *
                100,
            ),
          )
        : 0

    document.querySelector('#playerProgress').style.width =
      `${progress}%`
  } catch {
    const status =
      document.querySelector('#playerStatus')

    if (status) {
      status.textContent = 'Hors ligne'
    }
  }
}

async function playerCommand(path, data) {
  await api('POST', path, data)

  await new Promise(resolve =>
    setTimeout(resolve, 300),
  )

  await refreshPlayer()
}

function renderPlayer() {
  clearPoll()

  app.innerHTML = `
    <main class="app-shell">
      ${header('Lecteur')}

      <section class="detail-card">
        <div class="detail-eyebrow">
          Lecture en cours
        </div>

        <div
          id="playerStatus"
          class="player-status"
        >
          Chargement…
        </div>

        <div
          id="mediaTitle"
          class="media-title"
        >
          —
        </div>

        <div
          id="mediaMeta"
          class="media-meta"
        ></div>

        <div class="progress-track">
          <div
            id="playerProgress"
            class="progress-value"
          ></div>
        </div>
      </section>

      <section class="transport-card">
        <button
          class="transport-button"
          data-command="/player/previous"
        >
          ⏮
        </button>

        <button
          class="transport-button primary"
          data-command="/player/pause"
        >
          ⏯
        </button>

        <button
          class="transport-button"
          data-command="/player/next"
        >
          ⏭
        </button>

        <button
          class="transport-button danger-small"
          data-command="/player/stop"
        >
          ■
        </button>
      </section>

      ${playerMenu()}

      <div
        id="playerError"
        class="connection-message failure"
      ></div>
    </main>
  `

  bindNavigation()

  document
    .querySelectorAll('[data-command]')
    .forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await playerCommand(
            button.dataset.command,
          )
        } catch (error) {
          document.querySelector(
            '#playerError',
          ).textContent = error.message
        }
      })
    })

  refreshPlayer()

  playerPoll = setInterval(
    refreshPlayer,
    1500,
  )
}

/* ================================================================
   RADIOS
   ================================================================ */

async function renderRadios() {
  loading('Radios', 'player')

  try {
    const data = await api('GET', '/radios')
    const stations = data.stations || {}

    const cards = Object
      .entries(stations)
      .map(([id, station]) => `
        <button
          class="media-list-item"
          data-station="${esc(id)}"
        >
          <span class="media-list-icon">📻</span>

          <span class="media-list-main">
            ${esc(station.label || id)}
          </span>

          <span class="play-glyph">▶</span>
        </button>
      `)
      .join('')

    app.innerHTML = `
      <main class="app-shell">
        ${header('Radios', 'player')}

        <section class="media-list">
          ${cards || '<div class="empty-state">Aucune radio.</div>'}
        </section>

        <div
          id="radioMessage"
          class="connection-message"
        ></div>
      </main>
    `

    bindNavigation()

    document
      .querySelectorAll('[data-station]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const message =
            document.querySelector('#radioMessage')

          message.textContent = 'Lancement…'

          try {
            await api(
              'POST',
              '/player/radio',
              {
                station_id:
                  button.dataset.station,
              },
            )

            message.className =
              'connection-message success'

            message.textContent =
              'Radio lancée.'
          } catch (error) {
            message.className =
              'connection-message failure'

            message.textContent =
              error.message
          }
        })
      })
  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${header('Radios', 'player')}
        ${errorCard(error.message)}
      </main>
    `

    bindNavigation()
  }
}

/* ================================================================
   PLAYLISTS
   ================================================================ */

async function renderPlaylists() {
  loading('Playlists', 'player')

  try {
    const data = await api('GET', '/playlists')
    const playlists = data.playlists || []

    app.innerHTML = `
      <main class="app-shell">
        ${header('Playlists', 'player')}

        <section class="media-list">
          ${playlists.map(playlist => `
            <div class="playlist-card">
              <div
                class="playlist-name"
              >
                ${esc(playlist.label)}
              </div>

              <div class="playlist-actions">
                <button
                  class="mini-button"
                  data-random="${esc(playlist.id)}"
                >
                  Aléatoire
                </button>

                <button
                  class="mini-button"
                  data-play="${esc(playlist.id)}"
                >
                  Lire
                </button>

                <button
                  class="mini-button secondary"
                  data-route="tracks:${encodeURIComponent(playlist.id)}"
                >
                  Morceaux
                </button>
              </div>
            </div>
          `).join('')}
        </section>

        <div
          id="playlistMessage"
          class="connection-message"
        ></div>
      </main>
    `

    bindNavigation()

    document
      .querySelectorAll('[data-random]')
      .forEach(button => {
        button.addEventListener('click', () => {
          launchPlaylist(
            button.dataset.random,
            'random',
          )
        })
      })

    document
      .querySelectorAll('[data-play]')
      .forEach(button => {
        button.addEventListener('click', () => {
          launchPlaylist(
            button.dataset.play,
            'playlist',
          )
        })
      })
  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${header('Playlists', 'player')}
        ${errorCard(error.message)}
      </main>
    `

    bindNavigation()
  }
}

async function launchPlaylist(
  playlistId,
  mode,
  startFile,
) {
  const message =
    document.querySelector('#playlistMessage') ||
    document.querySelector('#trackMessage')

  if (message) {
    message.textContent = 'Lancement…'
  }

  try {
    await api(
      'POST',
      '/player/playlist',
      {
        playlist_id: playlistId,
        mode,
        ...(startFile
          ? { start_file: startFile }
          : {}),
      },
    )

    if (message) {
      message.className =
        'connection-message success'

      message.textContent =
        'Lecture lancée.'
    }
  } catch (error) {
    if (message) {
      message.className =
        'connection-message failure'

      message.textContent =
        error.message
    }
  }
}

async function renderTracks(playlistId) {
  loading('Morceaux', 'playlists')

  try {
    const data = await api(
      'GET',
      `/playlists/${encodeURIComponent(playlistId)}/files`,
    )

    const files = data.files || []

    app.innerHTML = `
      <main class="app-shell">
        ${header('Morceaux', 'playlists')}

        <section class="media-list">
          ${files.map(file => `
            <button
              class="track-item"
              data-file="${esc(file.path)}"
            >
              <span class="track-label">
                ${esc(file.label)}
              </span>

              <span class="track-size">
                ${esc(file.size_label)}
              </span>

              <span class="play-glyph">
                ▶
              </span>
            </button>
          `).join('') ||
          '<div class="empty-state">Aucun morceau.</div>'}
        </section>

        <div
          id="trackMessage"
          class="connection-message"
        ></div>
      </main>
    `

    bindNavigation()

    document
      .querySelectorAll('[data-file]')
      .forEach(button => {
        button.addEventListener('click', () => {
          launchPlaylist(
            playlistId,
            'playlist',
            button.dataset.file,
          )
        })
      })
  } catch (error) {
    app.innerHTML = `
      <main class="app-shell">
        ${header('Morceaux', 'playlists')}
        ${errorCard(error.message)}
      </main>
    `

    bindNavigation()
  }
}

/* ================================================================
   YOUTUBE
   ================================================================ */

function renderYoutube() {
  app.innerHTML = `
    <main class="app-shell">
      ${header('YouTube', 'player')}

      <section class="detail-card">
        <div class="detail-eyebrow">
          Lecture directe
        </div>

        <label class="field-label" for="youtubeUrl">
          Lien YouTube
        </label>

        <input
          id="youtubeUrl"
          class="text-input"
          type="url"
          placeholder="https://youtu.be/..."
        >

        <button
          id="youtubePlay"
          class="large-button"
        >
          Lire
        </button>

        <div
          id="youtubeMessage"
          class="connection-message"
        ></div>
      </section>
    </main>
  `

  bindNavigation()

  document
    .querySelector('#youtubePlay')
    .addEventListener('click', async () => {
      const url =
        document.querySelector('#youtubeUrl')
          .value
          .trim()

      const message =
        document.querySelector('#youtubeMessage')

      message.textContent = 'Lancement…'

      try {
        await api(
          'POST',
          '/player/youtube',
          { url },
        )

        message.className =
          'connection-message success'

        message.textContent =
          'Lecture YouTube lancée.'
      } catch (error) {
        message.className =
          'connection-message failure'

        message.textContent =
          error.message
      }
    })
}

/* ================================================================
   CONFIG PI / SYSTEME
   ================================================================ */

async function renderConfig() {
  loading('Config Pi')

  let system = null

  try {
    system = await api('GET', '/system')
  } catch {
    // La configuration serveur doit rester accessible.
  }

  const wifi = system?.wifi || {}
  const cpu = system?.cpu || {}
  const ram = system?.ram || {}
  const storage = system?.storage || {}

  app.innerHTML = `
    <main class="app-shell">
      ${header('Config Pi')}

      <section class="detail-card">
        <div class="detail-eyebrow">
          Serveur
        </div>

        <label class="field-label" for="serverInput">
          Adresse
        </label>

        <input
          id="serverInput"
          class="text-input"
          value="${esc(getServer())}"
          spellcheck="false"
        >

        <button
          id="saveServer"
          class="large-button"
        >
          Enregistrer et tester
        </button>

        <div
          id="serverMessage"
          class="connection-message"
        ></div>
      </section>

      ${
        system
          ? `
            <section class="system-grid">
              <div class="system-card">
                <div class="system-label">Wi-Fi</div>
                <div class="system-value">
                  ${esc(wifi.ssid || '—')}
                </div>
                <div class="system-sub">
                  ${esc(wifi.quality || '—')}
                  ${wifi.signal_dbm != null
                    ? ` · ${wifi.signal_dbm} dBm`
                    : ''}
                </div>
              </div>

              <div class="system-card">
                <div class="system-label">CPU</div>
                <div class="system-value">
                  ${cpu.percent ?? '—'} %
                </div>
                <div class="system-sub">
                  ${cpu.temperature ?? '—'} °C
                </div>
              </div>

              <div class="system-card">
                <div class="system-label">RAM</div>
                <div class="system-value">
                  ${ram.percent ?? '—'} %
                </div>
                <div class="system-sub">
                  ${esc(ram.used_label || '—')}
                  / ${esc(ram.total_label || '—')}
                </div>
              </div>

              <div class="system-card">
                <div class="system-label">
                  Stockage
                </div>

                <div class="system-value">
                  ${storage.percent ?? '—'} %
                </div>

                <div class="system-sub">
                  ${esc(storage.free_label || '—')}
                  libres
                </div>
              </div>
            </section>
          `
          : ''
      }
    </main>
  `

  bindNavigation()

  document
    .querySelector('#saveServer')
    .addEventListener('click', async () => {
      const input =
        document.querySelector('#serverInput')

      const message =
        document.querySelector('#serverMessage')

      setServer(input.value)
      input.value = getServer()

      message.textContent = 'Connexion…'

      const ok = await checkConnection()

      message.className =
        `connection-message ${
          ok ? 'success' : 'failure'
        }`

      message.textContent =
        ok
          ? 'Serveur connecté.'
          : 'Serveur indisponible.'
    })
}

/* ================================================================
   ROUTER
   ================================================================ */

async function renderRoute() {
  clearPoll()

  const route =
    window.location.hash.replace('#', '') ||
    'home'

  if (route.startsWith('tracks:')) {
    const id =
      decodeURIComponent(
        route.slice('tracks:'.length),
      )

    await renderTracks(id)
    return
  }

  switch (route) {
    case 'alarm':
      await renderAlarm()
      break

    case 'sleep':
      await renderSleep()
      break

    case 'player':
      renderPlayer()
      break

    case 'radios':
      await renderRadios()
      break

    case 'playlists':
      await renderPlaylists()
      break

    case 'youtube':
      renderYoutube()
      break

    case 'config':
      await renderConfig()
      break

    default:
      renderHome()
  }
}

window.addEventListener(
  'hashchange',
  renderRoute,
)

await checkConnection()
await renderRoute()


/* ================================================================
   ANDROID006_VOLUME_NATIVE
   ================================================================ */

let hardwareVolumeQueue = Promise.resolve()
let hardwareVolumeToastTimer = null

function showHardwareVolumeToast(text, isError = false) {
  let toast = document.querySelector('#hardwareVolumeToast')

  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'hardwareVolumeToast'
    toast.className = 'hardware-volume-toast'
    document.body.appendChild(toast)
  }

  toast.textContent = text
  toast.classList.toggle('error', isError)
  toast.classList.add('visible')

  if (hardwareVolumeToastTimer) {
    clearTimeout(hardwareVolumeToastTimer)
  }

  hardwareVolumeToastTimer = setTimeout(() => {
    toast.classList.remove('visible')
  }, 900)
}

window.addEventListener('maisonVolumeKey', event => {
  const delta =
    event.direction === 'up'
      ? 5
      : event.direction === 'down'
        ? -5
        : 0

  if (!delta) {
    return
  }

  hardwareVolumeQueue = hardwareVolumeQueue
    .then(async () => {
      const response = await api(
        'POST',
        '/player/volume',
        { delta },
      )

      const volume =
        response?.volume ??
        response?.data?.volume

      if (typeof volume === 'number') {
        showHardwareVolumeToast(
          `Volume ${Math.round(volume)} %`,
        )
      } else {
        showHardwareVolumeToast(
          'Volume modifie',
        )
      }
    })
    .catch(error => {
      showHardwareVolumeToast(
        error?.message || 'Lecteur indisponible',
        true,
      )
    })
})
