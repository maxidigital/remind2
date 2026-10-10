import { useEffect, useRef, useState } from 'react'
import AboutDialog from './AboutDialog'
import { fetchSpreadsheetUrl } from './api'
import { isLocationEnabled, setLocationEnabled } from './location'
import { isMoodEnabled, setMoodEnabled } from './mood'
import { disablePush, enablePush, isPushEnabled, isPushSupported } from './push'

type Theme = 'light' | 'dark'

interface Props {
  email: string
  onLogout: () => void
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('re.mind2.theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function Menu({ email, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [locationOn, setLocationOn] = useState(isLocationEnabled)
  const [moodOn, setMoodOn] = useState(isMoodEnabled)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    isPushEnabled()
      .then(setPushOn)
      .catch(() => {})
  }, [])

  async function handleTogglePush() {
    setOpen(false)
    if (!isPushSupported()) {
      setNotice(
        'Este navegador no permite notificaciones. En iPhone, agregá la app a la pantalla de inicio ' +
          '(Compartir → Agregar a inicio), abrila desde ahí y activalas de nuevo.',
      )
      return
    }
    setPushBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
      } else if ((await enablePush()) === 'enabled') {
        setPushOn(true)
        setNotice('Notificaciones activadas. Te tiene que llegar una de prueba ahora.')
      } else {
        setNotice('El permiso de notificaciones está bloqueado. Habilitalo en los ajustes del teléfono para esta app.')
      }
    } catch {
      setNotice('No se pudieron cambiar las notificaciones. Probá de nuevo.')
    } finally {
      setPushBusy(false)
    }
  }
  const [spreadsheetLoading, setSpreadsheetLoading] = useState(false)
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('re.mind2.theme', theme)
  }, [theme])

  // Precachear la URL apenas se monta el menú (no hace falta esperar a que
  // se abra), para que el click de "Ver planilla" casi siempre la tenga
  // lista y pueda abrir la ventana ya con destino, en un solo paso
  // sincrónico — ver por qué en el comentario de handleOpenSpreadsheet.
  useEffect(() => {
    fetchSpreadsheetUrl()
      .then(setSpreadsheetUrl)
      .catch(() => {})
  }, [])

  async function handleOpenSpreadsheet() {
    setOpen(false)
    if (spreadsheetLoading) return

    if (spreadsheetUrl) {
      // Camino rápido (el habitual, gracias al precacheo de arriba): la URL
      // ya está lista, así que se abre directo en el gesto del click. Nada
      // de ventana en blanco de por medio.
      window.open(spreadsheetUrl, '_blank', 'noopener')
      return
    }

    // Fallback poco frecuente (primera vez, fetch lento, o falló): hay que
    // abrir la ventana ANTES de tener la URL para que cuente como gesto del
    // usuario, y navegarla recién cuando el fetch resuelva.
    // OJO iOS Safari: este patrón (abrir en blanco, navegar después del
    // await) puede dejar la pestaña original varada en about:blank — Safari
    // a veces trata esa navegación diferida como una pestaña nueva en vez
    // de reusar la misma. No hay fix determinístico para ese caso puntual;
    // por eso el precacheo de arriba existe, para caer en este camino lo
    // menos posible.
    // Tampoco se puede pasar 'noopener' acá — con ese flag window.open()
    // devuelve null, y entonces nunca se llega a navegar a la planilla. Para
    // conseguir el mismo aislamiento sin perder la referencia, se abre sin
    // 'noopener' y se corta el vínculo a mano con win.opener = null.
    const win = window.open('', '_blank')
    if (!win) return // bloqueado por el navegador, nada más que hacer
    win.opener = null

    setSpreadsheetLoading(true)
    try {
      const url = await fetchSpreadsheetUrl()
      setSpreadsheetUrl(url) // cachear para la próxima vez
      win.location.href = url
    } catch {
      win.close()
    } finally {
      setSpreadsheetLoading(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="menu" ref={menuRef}>
      <button className="menu-trigger" onClick={() => setOpen((o) => !o)} aria-label="Menú">
        <HamburgerIcon />
      </button>
      {open && (
        <div className="menu-dropdown">
          <button
            className="menu-item"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setLocationEnabled(!locationOn)
              setLocationOn(!locationOn)
            }}
          >
            {locationOn ? 'No guardar ubicación' : 'Guardar ubicación'}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setMoodEnabled(!moodOn)
              setMoodOn(!moodOn)
            }}
          >
            {moodOn ? 'No preguntar cómo estoy' : 'Preguntar cómo estoy'}
          </button>
          <button className="menu-item" onClick={handleTogglePush} disabled={pushBusy}>
            {pushOn ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          </button>
          <button className="menu-item" onClick={handleOpenSpreadsheet} disabled={spreadsheetLoading}>
            Abrir planilla
          </button>
          <button className="menu-item menu-item--danger" onClick={onLogout}>
            Salir
          </button>
          <div className="menu-divider" />
          <button
            className="menu-item"
            onClick={() => {
              setAboutOpen(true)
              setOpen(false)
            }}
          >
            Acerca de...
          </button>
        </div>
      )}
      {aboutOpen && <AboutDialog email={email} onClose={() => setAboutOpen(false)} />}
      {notice && (
        <div className="confirm-backdrop" onClick={() => setNotice(null)}>
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{notice}</p>
            <div className="confirm-buttons">
              <button className="confirm-cancel" onClick={() => setNotice(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
