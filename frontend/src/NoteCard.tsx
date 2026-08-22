import { useEffect, useRef, useState } from 'react'
import type { NoteEntry } from './api'
import ConfirmDialog from './ConfirmDialog'

const RIGHT_SWIPE_THRESHOLD = 160 // swipe right abre el menú contextual (Compartir/Editar/Copiar)
const RIGHT_ACTIONS_WIDTH = 240 // swipe left reveals: Editar, Archivar, Eliminar
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_TOLERANCE = 12 // temblor natural del dedo al mantener presionado; más laxo que el umbral de swipe
const MENU_WIDTH = 208
const MENU_HEIGHT = 190
const MENU_MARGIN = 12
const MENU_GAP_FROM_TOUCH = 16
const GHOST_CLICK_GUARD_MS = 400

function formatTime(raw: string): string {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return raw
  }
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

interface Props {
  note: NoteEntry
  onArchive: (row: number) => void
  onDelete: (row: number) => void
  onEdit: (row: number, text: string) => void
}

interface DragState {
  startX: number
  startOffset: number
  dragging: boolean
}

export default function NoteCard({ note, onArchive, onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const [offset, setOffset] = useState(0)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLLIElement>(null)
  const menuOpenedAt = useRef(0)
  const time = formatTime(note.date)

  // Al soltar el dedo tras un long-press, el navegador puede sintetizar un
  // "click" fantasma sobre lo que haya quedado bajo el punto de contacto
  // (el propio menú recién abierto). Ignoramos clics dentro de esta ventana.
  function isGhostClick(): boolean {
    return Date.now() - menuOpenedAt.current < GHOST_CLICK_GUARD_MS
  }

  useEffect(() => {
    if (!menuPos) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuPos(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuPos])

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function openMenuAt(x: number, y: number) {
    const desiredLeft = x - MENU_WIDTH / 2
    const desiredTop = y + MENU_GAP_FROM_TOUCH
    const clampedX = Math.min(Math.max(desiredLeft, MENU_MARGIN), window.innerWidth - MENU_WIDTH - MENU_MARGIN)
    const clampedY = Math.min(Math.max(desiredTop, MENU_MARGIN), window.innerHeight - MENU_HEIGHT - MENU_MARGIN)
    menuOpenedAt.current = Date.now()
    setMenuPos({ x: clampedX, y: clampedY })
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (editing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startOffset: offset, dragging: false }
    if (offset !== 0) return // no long-press mientras el panel de swipe está abierto; este toque solo lo cierra

    const x = e.clientX
    const y = e.clientY
    longPressTimer.current = window.setTimeout(() => {
      dragRef.current = null // cancela cualquier intento de swipe en curso
      openMenuAt(x, y)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return

    const delta = e.clientX - drag.startX
    if (!drag.dragging && Math.abs(delta) > 6) {
      drag.dragging = true
    }
    // El long-press se cancela con un margen más generoso que el del swipe:
    // mantener el dedo quieto tiembla unos pocos píxeles y no debería bastar
    // para tirar abajo el menú contextual antes de que se cumplan los 500ms.
    if (longPressTimer.current !== null && Math.abs(delta) > LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPressTimer()
    }
    if (!drag.dragging) return

    setOffset(Math.min(RIGHT_SWIPE_THRESHOLD, Math.max(-RIGHT_ACTIONS_WIDTH, drag.startOffset + delta)))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    clearLongPressTimer()
    const drag = dragRef.current
    if (!drag) return

    if (drag.dragging) {
      if (offset > RIGHT_SWIPE_THRESHOLD / 2) {
        openMenuAt(e.clientX, e.clientY)
        setOffset(0)
      } else if (offset < -RIGHT_ACTIONS_WIDTH / 2) {
        setOffset(-RIGHT_ACTIONS_WIDTH)
      } else {
        setOffset(0)
      }
    } else if (offset !== 0) {
      setOffset(0)
    } else {
      setExpanded((v) => !v)
    }
    dragRef.current = null
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    openMenuAt(e.clientX, e.clientY)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(note.text)
    } catch {
      // ignore
    }
    setOffset(0)
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text: note.text })
      } catch {
        // user cancelled — nothing to do
      }
    } else {
      try {
        await navigator.clipboard.writeText(note.text)
      } catch {
        // ignore
      }
    }
    setOffset(0)
  }

  function startEdit() {
    setOffset(0)
    setDraft(note.text)
    setEditing(true)
  }

  function saveEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== note.text) {
      onEdit(note.row, trimmed)
    }
    setEditing(false)
  }

  return (
    <li className="note-card-wrapper" ref={wrapperRef}>
      {offset < 0 && (
        <div className="note-card-actions note-card-actions--right">
          <button className="note-action note-action--edit" onClick={startEdit}>
            Editar
          </button>
          <button
            className="note-action note-action--archive"
            onClick={() => {
              setOffset(0)
              setConfirmAction('archive')
            }}
          >
            Archivar
          </button>
          <button
            className="note-action note-action--delete"
            onClick={() => {
              setOffset(0)
              setConfirmAction('delete')
            }}
          >
            Eliminar
          </button>
        </div>
      )}

      <div
        className="note-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragRef.current?.dragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {editing ? (
          <div className="note-edit">
            <textarea
              className="note-edit-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="note-edit-buttons">
              <button className="note-edit-cancel" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button className="note-edit-save" onClick={saveEdit}>
                Guardar
              </button>
            </div>
          </div>
        ) : expanded ? (
          <>
            <span className="note-time">{time}</span>
            <p className="note-full-text">{note.text}</p>
          </>
        ) : (
          <div className="note-line">
            <span className="note-time">{time}</span>
            <span className="note-preview">{note.text}</span>
          </div>
        )}
      </div>

      {menuPos && (
        <>
          <div
            className="note-context-backdrop"
            onClick={() => {
              if (isGhostClick()) return
              setMenuPos(null)
            }}
          />
          <div className="menu-dropdown note-context-menu" style={{ left: menuPos.x, top: menuPos.y }}>
            <button
              className="menu-item menu-item--share"
              onClick={() => {
                if (isGhostClick()) return
                handleShare()
                setMenuPos(null)
              }}
            >
              <ShareIcon />
              Compartir
            </button>
            <button
              className="menu-item menu-item--edit"
              onClick={() => {
                if (isGhostClick()) return
                startEdit()
                setMenuPos(null)
              }}
            >
              <EditIcon />
              Editar
            </button>
            <button
              className="menu-item menu-item--copy"
              onClick={() => {
                if (isGhostClick()) return
                handleCopy()
                setMenuPos(null)
              }}
            >
              <CopyIcon />
              Copiar
            </button>
          </div>
        </>
      )}

      {confirmAction && (
        <ConfirmDialog
          message={confirmAction === 'archive' ? '¿Archivar esta nota?' : '¿Eliminar esta nota? No se puede deshacer.'}
          confirmLabel={confirmAction === 'archive' ? 'Archivar' : 'Eliminar'}
          onConfirm={() => {
            if (confirmAction === 'archive') onArchive(note.row)
            else onDelete(note.row)
            setConfirmAction(null)
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </li>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}
