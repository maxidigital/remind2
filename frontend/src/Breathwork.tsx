import { useState } from 'react'
import IceBathBreathwork from './IceBathBreathwork'

interface Routine {
  id: string
  name: string
}

const ROUTINES: Routine[] = [{ id: 'ice-bath', name: 'Ice Bath Breathwork' }]

interface Props {
  onBack: () => void
}

export default function Breathwork({ onBack }: Props) {
  const [routineId, setRoutineId] = useState<string | null>(null)

  if (routineId === 'ice-bath') {
    return <IceBathBreathwork onBack={() => setRoutineId(null)} />
  }

  return (
    <div className="breathwork">
      <button className="breathwork-back" onClick={onBack} aria-label="Volver">
        <BackIcon />
      </button>

      <div className="breathwork-idle">
        <p className="breathwork-title">Breathwork</p>
        <ul className="routine-list">
          {ROUTINES.map((routine) => (
            <li key={routine.id}>
              <button className="routine-item" onClick={() => setRoutineId(routine.id)}>
                {routine.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}
