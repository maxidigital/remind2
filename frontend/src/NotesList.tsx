import { Fragment, useEffect, useState } from 'react'
import { archiveNote, deleteNote, fetchNotes, type NoteEntry } from './api'
import NoteCard from './NoteCard'

interface Props {
  refreshKey: number
}

function dayKeyOf(rawDate: string): string {
  const date = new Date(rawDate)
  return Number.isNaN(date.getTime()) ? rawDate : date.toDateString()
}

function dayLabelOf(rawDate: string): string {
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) {
    return rawDate
  }

  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'

  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export default function NotesList({ refreshKey }: Props) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null)

  useEffect(() => {
    fetchNotes()
      .then(setNotes)
      .catch(() => setNotes([]))
  }, [refreshKey])

  function reload() {
    fetchNotes()
      .then(setNotes)
      .catch(() => setNotes([]))
  }

  async function handleArchive(row: number) {
    setNotes((prev) => (prev ? prev.filter((n) => n.row !== row) : prev))
    try {
      await archiveNote(row)
    } catch {
      reload()
    }
  }

  async function handleDelete(row: number) {
    setNotes((prev) => (prev ? prev.filter((n) => n.row !== row) : prev))
    try {
      await deleteNote(row)
    } catch {
      reload()
    }
  }

  if (notes === null) {
    return <p className="notes-status">Cargando notas…</p>
  }

  if (notes.length === 0) {
    return <p className="notes-status">Grabá tu primera nota 🎙️</p>
  }

  return (
    <ul className="notes-list">
      {notes.map((note, i) => {
        const showSeparator = i === 0 || dayKeyOf(note.date) !== dayKeyOf(notes[i - 1].date)
        return (
          <Fragment key={note.row}>
            {showSeparator && <li className="day-separator">{dayLabelOf(note.date)}</li>}
            <NoteCard note={note} onArchive={handleArchive} onDelete={handleDelete} />
          </Fragment>
        )
      })}
    </ul>
  )
}
