import { useEffect, useRef, useState } from 'react'
import type { NoteEntry } from './api'
import ConfirmDialog from './ConfirmDialog'

const LEFT_ACTIONS_WIDTH = 160 // swipe right reveals: Copiar, Compartir
const RIGHT_ACTIONS_WIDTH = 240 // swipe left reveals: Editar, Archivar, Eliminar
const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_TOLERANCE = 12 // temblor natural del dedo al mantener presionado; más laxo que el umbral de swipe
const MENU_WIDTH = 190
const MENU_HEIGHT = 150
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
  const [copied, setCopied] = useState(false)
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
    const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH)
    const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT)
    menuOpenedAt.current = Date.now()
    setMenuPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) })
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

    setOffset(Math.min(LEFT_ACTIONS_WIDTH, Math.max(-RIGHT_ACTIONS_WIDTH, drag.startOffset + delta)))
  }

  function handlePointerUp() {
    clearLongPressTimer()
    const drag = dragRef.current
    if (!drag) return

    if (drag.dragging) {
      setOffset((current) => {
        if (current > LEFT_ACTIONS_WIDTH / 2) return LEFT_ACTIONS_WIDTH
        if (current < -RIGHT_ACTIONS_WIDTH / 2) return -RIGHT_ACTIONS_WIDTH
        return 0
      })
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
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        setOffset(0)
      }, 600)
    } catch {
      setOffset(0)
    }
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
      {offset > 0 && (
        <div className="note-card-actions note-card-actions--left">
          <button className="note-action note-action--copy" onClick={handleCopy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button className="note-action note-action--share" onClick={handleShare}>
            Compartir
          </button>
        </div>
      )}

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
              className="menu-item"
              onClick={() => {
                if (isGhostClick()) return
                handleShare()
                setMenuPos(null)
              }}
            >
              Compartir
            </button>
            <button
              className="menu-item"
              onClick={() => {
                if (isGhostClick()) return
                startEdit()
                setMenuPos(null)
              }}
            >
              Editar
            </button>
            <button
              className="menu-item"
              onClick={() => {
                if (isGhostClick()) return
                handleCopy()
                setMenuPos(null)
              }}
            >
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
