import { useRef, useState } from 'react'
import { saveNote } from './api'

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
  }

  function stop() {
    mediaRecorderRef.current?.stop()
  }

  async function handleStop(mimeType: string) {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    setStatus('saving')

    const effectiveType = mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: effectiveType })
    const ext = extensionFor(effectiveType)

    try {
      await saveNote(blob, `recording.${ext}`)
      onSaved()
      setStatus('idle')
    } catch {
      setError('No se pudo guardar la nota')
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
