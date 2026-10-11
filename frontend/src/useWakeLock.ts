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
        // El sistema suelta el wake lock por su cuenta (pestaña oculta, aviso
        // de permiso, etc.) sin avisar por ningún otro lado. Si la referencia
        // quedara apuntando al lock ya soltado, al volver a foreground se
        // creería que sigue activo, no se pediría de nuevo y la pantalla se
        // apagaría a mitad de la grabación.
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current !== sentinel) return
          wakeLockRef.current = null
          if (!cancelled && active && document.visibilityState === 'visible') acquire()
        })
      } catch {
        // el navegador puede rechazar el pedido (pestaña oculta, batería baja, etc.); no es fatal
      }
    }

    async function release() {
      const sentinel = wakeLockRef.current
      // Se limpia antes de soltar para que el handler de 'release' no lo vuelva a pedir.
      wakeLockRef.current = null
      try {
        await sentinel?.release()
      } catch {
        // ya liberado o no soportado
      }
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
