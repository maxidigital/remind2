import { useRef, useState } from 'react'
import { saveMood } from './api'
import { requestCoords, settleCoords } from './location'
import { markMoodAnswered, snoozeMood } from './mood'

const MOODS = [
  { value: 1, face: '😞', label: 'Muy mal' },
  { value: 2, face: '🙁', label: 'Mal' },
  { value: 3, face: '😐', label: 'Normal' },
  { value: 4, face: '🙂', label: 'Bien' },
  { value: 5, face: '😄', label: 'Muy bien' },
]

interface Props {
  onClose: () => void
}

export default function MoodPrompt({ onClose }: Props) {
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState(false)
  // Se pide al mostrar la pregunta, para que esté lista cuando se toque una carita.
  const coordsRef = useRef(requestCoords())

  async function handlePick(value: number) {
    setSaving(value)
    setError(false)
    try {
      await saveMood(value, await settleCoords(coordsRef.current))
      markMoodAnswered()
      onClose()
    } catch {
      // No se marca como respondida: queda abierta para reintentar.
      setError(true)
      setSaving(null)
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
              className={`mood-face${saving === value ? ' mood-face--saving' : ''}`}
              aria-label={label}
              title={label}
              disabled={saving !== null}
              onClick={() => handlePick(value)}
            >
              {face}
            </button>
          ))}
        </div>
        {error && <p className="mood-error">No se pudo guardar. Probá de nuevo.</p>}
        <button className="mood-snooze" onClick={handleSnooze} disabled={saving !== null}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
