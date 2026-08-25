import { useEffect, useRef, useState } from 'react'
import { useWakeLock } from './useWakeLock'
import { unlockAudio, playPhaseChange, playRetentionPing, playDoubleTapConfirm, playFinalAlarm } from './breathworkSounds'

type Phase = 'idle' | 'breathing' | 'retention' | 'recovery' | 'done'
type BreathStage = 'inhale' | 'exhale'

const TOTAL_BREATHS = 10
const INHALE_MS = 1600
const EXHALE_MS = 1600
const RETENTION_PING_SECONDS = 30
const RECOVERY_SECONDS = 15

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

interface Props {
  onBack: () => void
}

export default function Breathwork({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [breathStage, setBreathStage] = useState<BreathStage>('inhale')
  const [breathCount, setBreathCount] = useState(0)
  const [retentionSeconds, setRetentionSeconds] = useState(0)
  const [recoverySeconds, setRecoverySeconds] = useState(RECOVERY_SECONDS)

  const breathCountRef = useRef(0)
  const breathTimerRef = useRef<number | null>(null)
  const retentionIntervalRef = useRef<number | null>(null)

  useWakeLock(phase === 'breathing' || phase === 'retention' || phase === 'recovery')

  // Limpieza al desmontar (ej. si se toca "volver" en medio de una fase):
  // el timeout de respiración no vive dentro de un efecto propio, así que no
  // se limpia solo.
  useEffect(() => {
    return () => {
      if (breathTimerRef.current !== null) window.clearTimeout(breathTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'retention') return
    setRetentionSeconds(0)
    retentionIntervalRef.current = window.setInterval(() => {
      setRetentionSeconds((s) => {
        const next = s + 1
        if (next % RETENTION_PING_SECONDS === 0) playRetentionPing()
        return next
      })
    }, 1000)
    return () => {
      if (retentionIntervalRef.current !== null) {
        window.clearInterval(retentionIntervalRef.current)
        retentionIntervalRef.current = null
      }
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'recovery') return
    setRecoverySeconds(RECOVERY_SECONDS)
    const intervalId = window.setInterval(() => {
      setRecoverySeconds((s) => {
        if (s <= 1) {
          window.clearInterval(intervalId)
          playFinalAlarm()
          setPhase('done')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [phase])

  function scheduleBreathStage(stage: BreathStage) {
    setBreathStage(stage)
    const duration = stage === 'inhale' ? INHALE_MS : EXHALE_MS
    breathTimerRef.current = window.setTimeout(() => {
      if (stage === 'exhale') {
        breathCountRef.current += 1
        setBreathCount(breathCountRef.current)
        if (breathCountRef.current >= TOTAL_BREATHS) {
          playPhaseChange()
          setPhase('retention')
          return
        }
        scheduleBreathStage('inhale')
      } else {
        scheduleBreathStage('exhale')
      }
    }, duration)
  }

  function handleStart() {
    unlockAudio()
    breathCountRef.current = 0
    setBreathCount(0)
    setPhase('breathing')
    scheduleBreathStage('inhale')
  }

  function handleRetentionDoubleClick() {
    if (phase !== 'retention') return
    if (retentionIntervalRef.current !== null) {
      window.clearInterval(retentionIntervalRef.current)
      retentionIntervalRef.current = null
    }
    playDoubleTapConfirm()
    setPhase('recovery')
  }

  return (
    <div className="breathwork">
      <button className="breathwork-back" onClick={onBack} aria-label="Volver">
        <BackIcon />
      </button>

      {phase === 'idle' && (
        <div className="breathwork-idle">
          <p className="breathwork-title">Breathwork</p>
          <p className="breathwork-subtitle">{TOTAL_BREATHS} respiraciones, después retención</p>
          <button className="btn btn-primary" onClick={handleStart}>
            Comenzar
          </button>
        </div>
      )}

      {phase === 'breathing' && (
        <div className="breathwork-stage">
          <div
            className="breath-circle"
            style={{
              transform: breathStage === 'inhale' ? 'scale(1)' : 'scale(0.72)',
              transitionDuration: `${breathStage === 'inhale' ? INHALE_MS : EXHALE_MS}ms`,
            }}
          >
            <span className="breath-count">{breathCount}</span>
          </div>
          <p className="breathwork-hint">{breathStage === 'inhale' ? 'Inhalá' : 'Exhalá'}</p>
        </div>
      )}

      {phase === 'retention' && (
        <div className="breathwork-stage">
          <div className="breath-circle breath-circle--static" onDoubleClick={handleRetentionDoubleClick}>
            <span className="breath-count">{formatDuration(retentionSeconds)}</span>
          </div>
          <p className="breathwork-hint">Retené el aire — doble tap cuando quieras soltar</p>
        </div>
      )}

      {phase === 'recovery' && (
        <div className="breathwork-stage">
          <div className="breath-circle breath-circle--static">
            <span className="breath-count">{recoverySeconds}</span>
          </div>
          <p className="breathwork-hint">Inhalá y sostené</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="breathwork-idle">
          <p className="breathwork-title">Listo</p>
          <button className="btn btn-primary" onClick={onBack}>
            Volver
          </button>
        </div>
      )}
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
