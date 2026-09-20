import { CapacitorHttp } from '@capacitor/core'

const DEFAULT_SERVER = 'http://192.168.1.34:8080'

export function getServer() {
  return localStorage.getItem('maison-sonore-server') || DEFAULT_SERVER
}

export function setServer(value) {
  let server = String(value || '').trim()

  if (!/^https?:\/\//i.test(server)) {
    server = `http://${server}`
  }

  server = server.replace(/\/+$/, '')

  localStorage.setItem('maison-sonore-server', server)

  return server
}

export async function apiRequest(method, path, data = undefined) {
  const options = {
    url: `${getServer()}/api/v1${path}`,
    method,
    headers: {
      Accept: 'application/json',
    },
    connectTimeout: 3000,
    readTimeout: 5000,
  }

  if (data !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.data = data
  }

  const response = await CapacitorHttp.request(options)

  if (response.status < 200 || response.status >= 300) {
    const message =
      response.data?.error?.message ||
      `Erreur HTTP ${response.status}`

    throw new Error(message)
  }

  return response.data
}
