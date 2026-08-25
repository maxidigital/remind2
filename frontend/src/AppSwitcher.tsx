import { useEffect, useRef, useState } from 'react'

interface Props {
  onOpenBreathwork: () => void
}

export default function AppSwitcher({ onOpenBreathwork }: Props) {
  const [open, setOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="menu app-switcher" ref={switcherRef}>
      <button className="menu-trigger app-grid-trigger" onClick={() => setOpen((o) => !o)} aria-label="Apps">
        <AppGridIcon />
      </button>
      {open && (
        <div className="menu-dropdown">
          <button className="menu-item menu-item--active" onClick={() => setOpen(false)}>
            Mis notas
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onOpenBreathwork()
            }}
          >
            Breathwork
          </button>
        </div>
      )}
    </div>
  )
}

function AppGridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <circle cx="5" cy="5" r="1.8" />
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="19" cy="5" r="1.8" />
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
      <circle cx="5" cy="19" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
      <circle cx="19" cy="19" r="1.8" />
    </svg>
  )
}
