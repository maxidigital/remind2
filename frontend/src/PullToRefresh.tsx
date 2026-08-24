import { useEffect, useRef, useState, type ReactNode } from 'react'

// Distancia (px) que hay que tirar para que se dispare el refresh, y tope
// visual para que el indicador no crezca sin límite.
const PULL_THRESHOLD = 70
const MAX_PULL = 110

interface Props {
  onRefresh: () => Promise<void>
  children: ReactNode
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [settling, setSettling] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || window.scrollY > 0) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return
      const delta = e.touches[0].clientY - startY.current

      if (delta <= 0 || window.scrollY > 0) {
        // se levantó el dedo hacia arriba, o pasó a scrollear la página normal
        startY.current = null
        if (pullRef.current !== 0) {
          setSettling(true)
          pullRef.current = 0
          setPull(0)
        }
        return
      }

      // evita el pull-to-refresh nativo del navegador (que haría un reload
      // completo de la página) mientras dura nuestro propio gesto
      e.preventDefault()
      setSettling(false)
      // resistencia tipo elástico: cada vez cuesta más tirar más lejos
      const resisted = Math.min(MAX_PULL, delta * 0.45)
      pullRef.current = resisted
      setPull(resisted)
    }

    async function onTouchEnd() {
      if (startY.current === null) return
      startY.current = null
      setSettling(true)

      if (pullRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        pullRef.current = PULL_THRESHOLD
        setPull(PULL_THRESHOLD)
        try {
          await onRefresh()
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
          pullRef.current = 0
          setPull(0)
        }
      } else {
        pullRef.current = 0
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh])

  // Mientras se tira activamente el spinner "se arma" girando en proporción
  // a la distancia; una vez soltado y en carga, gira de forma continua.
  const dragRotation = refreshing ? undefined : pull * 2.6

  return (
    <>
      <div className={`pull-indicator${settling ? ' pull-indicator--settling' : ''}`} style={{ height: pull }}>
        <span
          className={`pull-spinner${refreshing ? ' pull-spinner--spinning' : ''}`}
          style={dragRotation !== undefined ? { transform: `rotate(${dragRotation}deg)` } : undefined}
        />
      </div>
      {children}
    </>
  )
}
