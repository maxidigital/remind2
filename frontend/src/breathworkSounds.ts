// Señales de sonido del breathwork, sintetizadas con Web Audio (sin archivos
// de audio que mantener). El AudioContext se crea/desbloquea recién en el
// tap de "Comenzar" — los navegadores exigen un gesto de usuario para
// arrancarlo, no se puede crear antes.
let audioContext: AudioContext | null = null

export function unlockAudio(): void {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new AudioContextClass()
  }
  // En iOS Safari (y algunos otros) el context arranca 'suspended' aunque se
  // cree dentro de un gesto del usuario — sin este resume() no suena nada.
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  // Truco de desbloqueo de iOS: no alcanza con crear/resumir el context, hace
  // falta arrancar un nodo de audio real (aunque sea inaudible) DENTRO del
  // mismo gesto para que el sistema deje sonar lo que se programe después
  // (los tonos reales suenan recién más tarde, ya fuera del gesto).
  const oscillator = audioContext.createOscillator()
  const silentGain = audioContext.createGain()
  silentGain.gain.value = 0
  oscillator.connect(silentGain)
  silentGain.connect(audioContext.destination)
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.01)
}

function playTone(freq: number, durationMs: number, startDelayMs = 0): void {
  if (!audioContext) return
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }
  const ctx = audioContext
  const startAt = ctx.currentTime + startDelayMs / 1000
  const durationSec = durationMs / 1000

  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = freq
  oscillator.connect(gain)
  gain.connect(ctx.destination)

  // fade in/out corto para evitar el "click" de arrancar/cortar la onda seca
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(0.35, startAt + 0.015)
  gain.gain.linearRampToValueAtTime(0.35, startAt + durationSec - 0.03)
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec)

  oscillator.start(startAt)
  oscillator.stop(startAt + durationSec)
}

// Fin de la fase de respiración, arranca la retención: dos notas ascendentes.
export function playPhaseChange(): void {
  playTone(440, 150)
  playTone(660, 200, 160)
}

// Aviso periódico durante la retención (ojos cerrados, no hace falta mirar).
export function playRetentionPing(): void {
  playTone(520, 120)
}

// Confirmación del doble-tap: arrancan los 15s.
export function playDoubleTapConfirm(): void {
  playTone(880, 90)
}

// Fin de los 15 segundos: más largo e insistente que el resto.
export function playFinalAlarm(): void {
  playTone(660, 180)
  playTone(660, 180, 250)
  playTone(660, 260, 500)
}
