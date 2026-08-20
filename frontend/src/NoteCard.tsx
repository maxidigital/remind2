import { useRef, useState } from 'react'
import type { NoteEntry } from './api'

const ACTION_WIDTH = 160 // two 80px buttons revealed on either side

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
  const [copied, setCopied] = useState(false)
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

    setOffset(Math.min(ACTION_WIDTH, Math.max(-ACTION_WIDTH, drag.startOffset + delta)))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    if (!drag) return

    if (drag.dragging) {
      setOffset((current) => {
        if (current > ACTION_WIDTH / 2) return ACTION_WIDTH
        if (current < -ACTION_WIDTH / 2) return -ACTION_WIDTH
        return 0
      })
    } else if (offset !== 0) {
      setOffset(0)
    } else {
      setExpanded((v) => !v)
    }
    dragRef.current = null
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

  return (
    <li className="note-card-wrapper">
      <div className="note-card-actions note-card-actions--left">
        <button className="note-action note-action--copy" onClick={handleCopy}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button className="note-action note-action--share" onClick={handleShare}>
          Compartir
        </button>
      </div>

      <div className="note-card-actions note-card-actions--right">
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
