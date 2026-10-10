// "¿Cómo estás?": cada cierto tiempo, al abrir la app o volver a ella, se
// muestran 5 caritas. Cuándo se respondió por última vez vive en este
// dispositivo (localStorage): una app web no puede preguntar estando cerrada,
// así que no hay nada que sincronizar con el servidor.

const ENABLED_KEY = 're.mind2.mood'
const ANSWERED_AT_KEY = 're.mind2.mood.answeredAt'
const SNOOZED_UNTIL_KEY = 're.mind2.mood.snoozedUntil'

const ASK_EVERY_MS = 3 * 60 * 60 * 1000
const SNOOZE_MS = 60 * 60 * 1000

export function isMoodEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== 'off'
}

export function setMoodEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off')
}

function storedTime(key: string): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? value : 0
}

export function shouldAskMood(now = Date.now()): boolean {
  if (!isMoodEnabled()) return false
  return now - storedTime(ANSWERED_AT_KEY) >= ASK_EVERY_MS && now >= storedTime(SNOOZED_UNTIL_KEY)
}

export function markMoodAnswered(now = Date.now()): void {
  localStorage.setItem(ANSWERED_AT_KEY, String(now))
}

export function snoozeMood(now = Date.now()): void {
  localStorage.setItem(SNOOZED_UNTIL_KEY, String(now + SNOOZE_MS))
}
