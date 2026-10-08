import { useRef, useState } from 'react'
import { saveNote, SaveNoteError } from './api'
import { enqueue, newId, removeItem, markBlocked, markInFlight, clearInFlight } from './offlineQueue'
import EmptyRecordingDialog from './EmptyRecordingDialog'
import { AudioLevelMonitor } from './audioLevel'
import { useWakeLock } from './useWakeLock'

type Status = 'idle' | 'recording' | 'saving' | 'error'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

interface Props {
  onSaved: () => void
  onWrite: () => void
}

export default function Recorder({ onSaved, onWrite }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioLevelRef = useRef<AudioLevelMonitor | null>(null)

  useWakeLock(status === 'recording')

  async function start() {
    setError(null)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('No se pudo acceder al micrófono')
      return
    }

    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }
    recorder.onstop = () => handleStop(mimeType || recorder.mimeType)

    streamRef.current = stream
    mediaRecorderRef.current = recorder
    audioLevelRef.current = new AudioLevelMonitor(stream)
    recorder.start()
    setStatus('recording')

    setElapsedSeconds(0)
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
  }

  function stop() {
    mediaRecorderRef.current?.stop()
  }

  async function handleStop(mimeType: string) {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())

    const hadSound = audioLevelRef.current?.hadSound() ?? true
    audioLevelRef.current?.dispose()
    audioLevelRef.current = null

    if (!hadSound) {
      // No se detectó energía de voz en ningún momento de la grabación: ni
      // siquiera vale la pena mandarla a Whisper.
      setShowEmpty(true)
      setStatus('idle')
      return
    }

    setStatus('saving')

    const effectiveType = mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: effectiveType })
    const ext = extensionFor(effectiveType)
    const filename = `recording.${ext}`

    // Se persiste en IndexedDB ANTES de intentar la red, para que una falla dura
    // a mitad de subida (o cerrar la pestaña) nunca pierda la grabación.
    let queueId: string | null = null
    try {
      queueId = await enqueue(blob, filename)
    } catch {
      // IndexedDB no disponible (navegación privada, cuota, etc.) — degrada a
      // envío directo best-effort en vez de bloquear la grabación.
    }

    // Mientras este envío directo está en vuelo, el loop de reintento de la
    // cola (visibilitychange/focus/online/intervalo) no debe tocar el mismo
    // ítem — si no, puede reenviarlo por su cuenta y la nota queda duplicada.
    if (queueId) markInFlight(queueId)
    try {
      const result = await saveNote(blob, filename, queueId ?? newId())
      if (queueId) await removeItem(queueId)
      if (result.text.trim()) {
        onSaved()
      } else {
        setShowEmpty(true)
      }
      setStatus('idle')
    } catch (err) {
      if (err instanceof SaveNoteError && err.retryable) {
        // Queda en la cola ('pending'); el loop de reintento (evento online /
        // intervalo de 30s / próxima apertura de la app) la va a recoger.
        setStatus('idle')
        return
      }

      if (err instanceof SaveNoteError && err.status === 413) {
        if (queueId) await markBlocked(queueId, 'TOO_LARGE')
        setError('La nota es muy larga para subirla. Grabá una más corta.')
        setStatus('error')
        return
      }

      if (err instanceof SaveNoteError && err.status === 401) {
        if (queueId) await markBlocked(queueId, 'AUTH_EXPIRED')
        setError('Tu sesión expiró. Volvé a iniciar sesión.')
        setStatus('error')
        return
      }

      setError('No se pudo guardar la nota. Se reintentará más tarde.')
      setStatus('error')
    } finally {
      if (queueId) clearInFlight(queueId)
    }
  }

  function handleClick() {
    if (status === 'recording') {
      stop()
    } else if (status === 'idle' || status === 'error') {
      start()
    }
  }

  return (
    <div className="recorder">
      {error && <p className="recorder-error">{error}</p>}
      <div className="recorder-row">
        {status === 'recording' ? (
          <span className="recorder-listening">Escuchando</span>
        ) : (
          <button className="write-button" onClick={onWrite} disabled={status === 'saving'} aria-label="Escribir nota">
            <PencilIcon />
          </button>
        )}
        <button
          className={`record-button record-button--${status}`}
          onClick={handleClick}
          disabled={status === 'saving'}
          aria-label={status === 'recording' ? 'Detener grabación' : 'Grabar nota'}
        >
          <MicIcon />
        </button>
        <span className="recorder-timer">{status === 'recording' && formatDuration(elapsedSeconds)}</span>
      </div>
      <span className="recorder-label">{status === 'error' && 'Tocá para reintentar'}</span>
      {showEmpty && <EmptyRecordingDialog onClose={() => setShowEmpty(false)} />}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
