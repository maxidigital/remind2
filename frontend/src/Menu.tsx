import { useEffect, useRef, useState } from 'react'

type Theme = 'light' | 'dark'

interface Props {
  onLogout: () => void
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('re.mind2.theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function Menu({ onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('re.mind2.theme', theme)
  }, [theme])

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
          <button className="menu-item menu-item--danger" onClick={onLogout}>
            Salir
          </button>
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
