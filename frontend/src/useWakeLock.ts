import { useEffect, useRef } from 'react'

// Mantiene la pantalla despierta mientras `active` es true. El navegador
// libera el wake lock por su cuenta cuando la pestaña pasa a background, así
// que hay que reintentar al volver a foreground si sigue activo.
export function useWakeLock(active: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let cancelled = false

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await sentinel.release()
          return
        }
        wakeLockRef.current = sentinel
      } catch {
        // el navegador puede rechazar el pedido (pestaña oculta, batería baja, etc.); no es fatal
      }
    }

    async function release() {
      try {
        await wakeLockRef.current?.release()
      } catch {
        // ya liberado o no soportado
      }
      wakeLockRef.current = null
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && active && !wakeLockRef.current) {
        acquire()
      }
    }

    if (active) {
      acquire()
    } else {
      release()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      release()
    }
  }, [active])
}
