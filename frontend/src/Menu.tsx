import { useEffect, useRef, useState } from 'react'
import AboutDialog from './AboutDialog'
import { fetchSpreadsheetUrl } from './api'

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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('re.mind2.theme', theme)
  }, [theme])

  async function handleOpenSpreadsheet() {
    setOpen(false)
    try {
      const url = await fetchSpreadsheetUrl()
      window.open(url, '_blank', 'noopener')
    } catch {
      // ignore — same silent-fail pattern as copy/share in NoteCard
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
          <button className="menu-item" onClick={handleOpenSpreadsheet}>
            Ver planilla
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
