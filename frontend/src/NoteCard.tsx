import { useState } from 'react'
import type { NoteEntry } from './api'

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

export default function NoteCard({ note }: { note: NoteEntry }) {
  const [expanded, setExpanded] = useState(false)
  const time = formatTime(note.date)

  return (
    <li
      className="note-card"
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((e) => !e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded((v) => !v)
        }
      }}
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
    </li>
  )
}
