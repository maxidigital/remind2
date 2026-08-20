import type { NoteEntry } from './api'

function formatDate(raw: string): string {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return raw
  }
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NoteCard({ note }: { note: NoteEntry }) {
  return (
    <li className="note-card">
      <span className="note-card-date">{formatDate(note.date)}</span>
      <p className="note-card-text">{note.text}</p>
    </li>
  )
}
