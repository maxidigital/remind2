import { useEffect, useRef, useState } from 'react'
import { saveMood, transcribeMoodComment } from './api'
import { AudioLevelMonitor } from './audioLevel'
import { extensionFor, pickMimeType } from './audioFormat'
import { requestCoords, settleCoords } from './location'
import { markMoodAnswered, snoozeMood } from './mood'

const MOODS = [
  { value: 1, face: '😞', label: 'Muy mal' },
  { value: 2, face: '🙁', label: 'Mal' },
  { value: 3, face: '😐', label: 'Normal' },
  { value: 4, face: '🙂', label: 'Bien' },
  { value: 5, face: '😄', label: 'Muy bien' },
]

type VoiceStatus = 'idle' | 'recording' | 'transcribing'

interface Props {
  onClose: () => void
}

export default function MoodPrompt({ onClose }: Props) {
  const [mood, setMood] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [voice, setVoice] = useState<VoiceStatus>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Se pide al mostrar la pregunta, para que esté lista al guardar.
  const coordsRef = useRef(requestCoords())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioLevelRef = useRef<AudioLevelMonitor | null>(null)

  const busy = saving || voice !== 'idle'

  // Igual que en Recorder: si la app deja de estar visible el sistema corta
  // el micrófono, así que se cierra la grabación mientras todavía sirve.
  useEffect(() => {
    if (voice !== 'recording') return
    function handleHidden() {
      if (document.visibilityState === 'hidden') recorderRef.current?.stop()
    }
    document.addEventListener('visibilitychange', handleHidden)
    return () => document.removeEventListener('visibilitychange', handleHidden)
  }, [voice])

  // Cerrar el diálogo a mitad de una grabación no debe dejar el micrófono abierto.
  useEffect(
    () => () => {
      if (recorderRef.current) recorderRef.current.onstop = null
      releaseMic()
    },
    [],
  )

  function releaseMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    audioLevelRef.current?.dispose()
    audioLevelRef.current = null
  }

  async function startRecording() {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('No se pudo acceder al micrófono.')
      return
    }

    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => handleRecordingStop(mimeType || recorder.mimeType)

    streamRef.current = stream
    recorderRef.current = recorder
    audioLevelRef.current = new AudioLevelMonitor(stream)
    recorder.start()
    setVoice('recording')
  }

  async function handleRecordingStop(mimeType: string) {
    const hadSound = audioLevelRef.current?.hadSound() ?? true
    releaseMic()
    if (!hadSound) {
      setError('No se escuchó nada. Probá de nuevo.')
      setVoice('idle')
      return
    }

    setVoice('transcribing')
    const effectiveType = mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: effectiveType })
    try {
      const text = await transcribeMoodComment(blob, `comment.${extensionFor(effectiveType)}`)
      if (text) {
        // Se suma a lo ya escrito: se puede escribir y dictar, o dictar varias veces.
        setComment((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text))
      } else {
        setError('No se entendió lo que dijiste. Probá de nuevo.')
      }
    } catch {
      setError('No se pudo transcribir. Probá de nuevo o escribilo.')
    }
    setVoice('idle')
  }

  function handleMic() {
    if (voice === 'recording') recorderRef.current?.stop()
    else if (voice === 'idle') startRecording()
  }

  async function handleSave() {
    if (mood === null) return
    setSaving(true)
    setError(null)
    try {
      await saveMood(mood, comment.trim(), await settleCoords(coordsRef.current))
      markMoodAnswered()
      onClose()
    } catch {
      // No se marca como respondida: queda abierta para reintentar.
      setError('No se pudo guardar. Probá de nuevo.')
      setSaving(false)
    }
  }

  function handleSnooze() {
    snoozeMood()
    onClose()
  }

  return (
    <div className="confirm-backdrop">
      <div className="confirm-dialog mood-dialog" role="dialog" aria-modal="true" aria-label="¿Cómo estás?">
        <p>¿Cómo estás?</p>
        <div className="mood-faces">
          {MOODS.map(({ value, face, label }) => (
            <button
              key={value}
              className={`mood-face${mood === value ? ' mood-face--selected' : ''}`}
              aria-label={label}
              aria-pressed={mood === value}
              title={label}
              disabled={saving}
              onClick={() => setMood(value)}
            >
              {face}
            </button>
          ))}
        </div>
        <div className="mood-comment">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={voice === 'transcribing' ? 'Transcribiendo…' : '¿Querés contar algo? (opcional)'}
            rows={3}
            disabled={busy}
          />
          <button
            className={`mood-mic${voice === 'recording' ? ' mood-mic--recording' : ''}`}
            onClick={handleMic}
            disabled={saving || voice === 'transcribing'}
            aria-label={voice === 'recording' ? 'Terminar mensaje de voz' : 'Dictar un mensaje de voz'}
            title={voice === 'recording' ? 'Terminar' : 'Dictar'}
          >
            {voice === 'recording' ? <StopIcon /> : <MicIcon />}
          </button>
        </div>
        {error && <p className="mood-error">{error}</p>}
        <button className="btn btn-primary mood-save" onClick={handleSave} disabled={mood === null || busy}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="mood-snooze" onClick={handleSnooze} disabled={busy}>
          Ahora no
        </button>
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
