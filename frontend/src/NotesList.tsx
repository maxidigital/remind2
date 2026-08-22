import { Fragment, useEffect, useState } from 'react'
import { archiveNote, deleteNote, fetchNotes, updateNote, updateNoteColor, type NoteEntry } from './api'
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

const FADE_STEP = 0.12 // cuánto baja la opacidad por cada nota más vieja
const FADE_MIN_OPACITY = 0.4

function fadeOpacity(index: number): number {
  return Math.max(FADE_MIN_OPACITY, 1 - index * FADE_STEP)
}

export default function NotesList({ refreshKey }: Props) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  const pending = usePendingQueue()

  function toggleDay(dayKey: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dayKey)) next.delete(dayKey)
      else next.add(dayKey)
      return next
    })
  }

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

  async function handleColorChange(row: number, color: string) {
    setNotes((prev) => (prev ? prev.map((n) => (n.row === row ? { ...n, color } : n)) : prev))
    try {
      await updateNoteColor(row, color)
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
        const dayKey = dayKeyOf(entry.date)
        const showSeparator = i === 0 || dayKey !== dayKeyOf(merged[i - 1].date)
        const collapsed = collapsedDays.has(dayKey)
        const key = entry.kind === 'note' ? `note-${entry.note.row}` : `pending-${entry.item.id}`
        return (
          <Fragment key={key}>
            {showSeparator && (
              <li
                className={`day-separator${collapsed ? ' day-separator--collapsed' : ''}`}
                onClick={() => toggleDay(dayKey)}
              >
                {dayLabelOf(entry.date)}
              </li>
            )}
            {!collapsed &&
              (entry.kind === 'note' ? (
                <NoteCard
                  note={entry.note}
                  expanded={entry.note.row === expandedRow}
                  onToggleExpand={() => setExpandedRow((prev) => (prev === entry.note.row ? null : entry.note.row))}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onColorChange={handleColorChange}
                  style={{ opacity: entry.note.row === expandedRow ? 1 : fadeOpacity(i) }}
                />
              ) : (
                <PendingNoteRow item={entry.item} onRetry={retryItem} onDiscard={discardItem} style={{ opacity: fadeOpacity(i) }} />
              ))}
          </Fragment>
        )
      })}
    </ul>
  )
}
