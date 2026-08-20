import { useRef, useState } from 'react'
import type { NoteEntry } from './api'

const ACTION_WIDTH = 160 // two 80px buttons revealed behind the card

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
}

interface DragState {
  startX: number
  startOffset: number
  dragging: boolean
}

export default function NoteCard({ note, onArchive, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [offset, setOffset] = useState(0)
  const dragRef = useRef<DragState | null>(null)
  const time = formatTime(note.date)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startOffset: offset, dragging: false }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return

    const delta = e.clientX - drag.startX
    if (!drag.dragging && Math.abs(delta) > 6) {
      drag.dragging = true
    }
    if (!drag.dragging) return

    setOffset(Math.min(0, Math.max(-ACTION_WIDTH, drag.startOffset + delta)))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    if (!drag) return

    if (drag.dragging) {
      setOffset((current) => (current < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0))
    } else if (offset < 0) {
      setOffset(0)
    } else {
      setExpanded((v) => !v)
    }
    dragRef.current = null
  }

  return (
    <li className="note-card-wrapper">
      <div className="note-card-actions">
        <button
          className="note-action note-action--archive"
          onClick={() => {
            setOffset(0)
            onArchive(note.row)
          }}
        >
          Archivar
        </button>
        <button
          className="note-action note-action--delete"
          onClick={() => {
            setOffset(0)
            onDelete(note.row)
          }}
        >
          Eliminar
        </button>
      </div>

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
      >
        {expanded ? (
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
    </li>
  )
}
