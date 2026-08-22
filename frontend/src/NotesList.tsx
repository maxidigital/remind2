import { Fragment, useEffect, useState } from 'react'
import { archiveNote, deleteNote, fetchNotes, updateNote, type NoteEntry } from './api'
import { usePendingQueue, retryItem, discardItem, subscribe, type QueueItem } from './offlineQueue'
import NoteCard from './NoteCard'
import PendingNoteRow from './PendingNoteRow'

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

type MergedItem =
  | { kind: 'note'; date: string; note: NoteEntry }
  | { kind: 'pending'; date: string; item: QueueItem }

export default function NotesList({ refreshKey }: Props) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null)
  const pending = usePendingQueue()

  function reload() {
    fetchNotes()
      .then(setNotes)
      .catch(() => setNotes([]))
  }

  useEffect(reload, [refreshKey])

  // Cuando un pendiente se sube con éxito y desaparece de la cola, refrescar
  // las notas confirmadas para que la nota recién sincronizada aparezca.
  useEffect(() => subscribe(reload), [])

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

  async function handleEdit(row: number, text: string) {
    setNotes((prev) => (prev ? prev.map((n) => (n.row === row ? { ...n, text } : n)) : prev))
    try {
      await updateNote(row, text)
    } catch {
      reload()
    }
  }

  if (notes === null) {
    return <p className="notes-status">Cargando notas…</p>
  }

  if (notes.length === 0 && pending.length === 0) {
    return <p className="notes-status">Grabá tu primera nota 🎙️</p>
  }

  const merged: MergedItem[] = [
    ...pending.map((item) => ({ kind: 'pending' as const, date: new Date(item.createdAt).toISOString(), item })),
    ...notes.map((note) => ({ kind: 'note' as const, date: note.date, note })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <ul className="notes-list">
      {merged.map((entry, i) => {
        const showSeparator = i === 0 || dayKeyOf(entry.date) !== dayKeyOf(merged[i - 1].date)
        const key = entry.kind === 'note' ? `note-${entry.note.row}` : `pending-${entry.item.id}`
        return (
          <Fragment key={key}>
            {showSeparator && <li className="day-separator">{dayLabelOf(entry.date)}</li>}
            {entry.kind === 'note' ? (
              <NoteCard note={entry.note} onArchive={handleArchive} onDelete={handleDelete} onEdit={handleEdit} />
            ) : (
              <PendingNoteRow item={entry.item} onRetry={retryItem} onDiscard={discardItem} />
            )}
          </Fragment>
        )
      })}
    </ul>
  )
}
