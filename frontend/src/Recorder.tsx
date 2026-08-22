import { useEffect, useRef, useState } from 'react'
import { saveNote, SaveNoteError } from './api'
import { enqueue, removeItem, markBlocked } from './offlineQueue'

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

interface Props {
  onSaved: () => void
}

export default function Recorder({ onSaved }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // el navegador puede rechazar el pedido (pestaña oculta, batería baja, etc.); no es fatal
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release()
    } catch {
      // ya liberado o no soportado
    }
    wakeLockRef.current = null
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && status === 'recording') {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [status])

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
    recorder.start()
    setStatus('recording')
    acquireWakeLock()
  }

  function stop() {
    mediaRecorderRef.current?.stop()
  }

  async function handleStop(mimeType: string) {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    releaseWakeLock()
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

    try {
      await saveNote(blob, filename)
      if (queueId) await removeItem(queueId)
      onSaved()
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
      <button
        className={`record-button record-button--${status}`}
        onClick={handleClick}
        disabled={status === 'saving'}
        aria-label={status === 'recording' ? 'Detener grabación' : 'Grabar nota'}
      >
        <MicIcon />
      </button>
      <span className="recorder-label">
        {status === 'recording' && 'Grabando… tocá para terminar'}
        {status === 'saving' && 'Transcribiendo…'}
        {status === 'idle' && 'Tocá para grabar'}
        {status === 'error' && 'Tocá para reintentar'}
      </span>
    </div>
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
