// Ubicación de cada nota: se pide al navegador al empezar a grabar/escribir
// y viaja con la nota; el backend la traduce a un nombre de lugar y la guarda
// en la planilla. Se puede apagar desde el menú.

export interface Coords {
  lat: number
  lng: number
}

const STORAGE_KEY = 're.mind2.location'
// Para nombrar un lugar (calle/barrio) no hace falta el GPS fino: sin alta
// precisión la respuesta llega mucho antes y gasta menos batería.
const POSITION_TIMEOUT_MS = 8_000
const POSITION_MAX_AGE_MS = 120_000

export function isLocationEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'off'
}

export function setLocationEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
}

/**
 * Coordenadas actuales, o null si la opción está apagada, el permiso fue
 * denegado o el dispositivo no las consiguió a tiempo. Nunca rechaza: la
 * ubicación es un extra y no debe impedir guardar una nota.
 */
export function requestCoords(): Promise<Coords | null> {
  if (!isLocationEnabled() || !('geolocation' in navigator)) return Promise.resolve(null)
  // En una app instalada en iOS cada consulta al GPS puede volver a mostrar
  // el aviso de permiso: se reusa la última mientras siga siendo reciente.
  if (lastRequest && Date.now() - lastRequest.at < POSITION_MAX_AGE_MS) return lastRequest.coords
  const coords = queryPosition()
  lastRequest = { at: Date.now(), coords }
  return coords
}

let lastRequest: { at: number; coords: Promise<Coords | null> } | null = null

function queryPosition(): Promise<Coords | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS },
    )
  })
}

/**
 * Lo que haya dado `pending` hasta ahora, esperando como mucho `graceMs`:
 * al guardar una nota no se la demora por un GPS que todavía no respondió.
 */
export function settleCoords(pending: Promise<Coords | null> | null, graceMs = 1_000): Promise<Coords | null> {
  if (!pending) return Promise.resolve(null)
  return Promise.race([pending, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), graceMs))])
}
