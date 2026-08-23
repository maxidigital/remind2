// Filtro de silencio del lado del cliente: mide la energía (RMS) del audio
// del micrófono mientras se graba, para detectar si en algún momento hubo
// algo parecido a voz. Complementa (no reemplaza) el filtro de alucinaciones
// de WhisperTranscriptionService.java: atrapa el caso de silencio/ruido de
// fondo puro ANTES de gastar una llamada a Whisper, algo que el filtro del
// servidor no puede hacer porque solo ve el resultado de la transcripción.
const SAMPLE_INTERVAL_MS = 100

// TODO: calibrar en dispositivo real (no se pudo probar sin dev server en la
// sesión del 2026-08-22). RMS de silencio de ambiente típico ronda 0.001-0.01;
// voz hablada a distancia normal suele superar 0.02-0.03. Si se ve que notas
// con voz real quedan marcadas como vacías, bajar este valor; si sigue
// pasando ruido de ambiente como si fuera voz, subirlo.
const RMS_THRESHOLD = 0.02

// Exigir varias muestras seguidas por encima del umbral (no solo una) para
// no contar un golpe o click puntual como voz.
const CONSECUTIVE_SAMPLES_REQUIRED = 3

export class AudioLevelMonitor {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private intervalId: number | null = null
  private buffer: Float32Array<ArrayBuffer>
  private consecutiveLoud = 0
  private detectedSound = false

  constructor(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048
      this.source = this.audioContext.createMediaStreamSource(stream)
      this.source.connect(this.analyser)
      this.buffer = new Float32Array(this.analyser.fftSize)
      this.intervalId = window.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    } catch {
      // AudioContext no disponible/bloqueado en este navegador: no hay forma
      // de medir energía, así que no bloqueamos la nota (fail-open) — queda
      // el filtro del servidor como única defensa para este caso.
      this.detectedSound = true
      this.buffer = new Float32Array(0)
    }
  }

  private sample() {
    if (!this.analyser) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sumSquares = 0
    for (let i = 0; i < this.buffer.length; i++) {
      sumSquares += this.buffer[i] * this.buffer[i]
    }
    const rms = Math.sqrt(sumSquares / this.buffer.length)
    if (rms > RMS_THRESHOLD) {
      this.consecutiveLoud++
      if (this.consecutiveLoud >= CONSECUTIVE_SAMPLES_REQUIRED) {
        this.detectedSound = true
      }
    } else {
      this.consecutiveLoud = 0
    }
  }

  hadSound(): boolean {
    return this.detectedSound
  }

  dispose() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.source?.disconnect()
    this.analyser?.disconnect()
    this.audioContext?.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.source = null
  }
}
