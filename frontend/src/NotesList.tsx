import { useEffect, useState } from 'react'
import { fetchNotes, type NoteEntry } from './api'
import NoteCard from './NoteCard'

interface Props {
  refreshKey: number
}

export default function NotesList({ refreshKey }: Props) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null)

  useEffect(() => {
    fetchNotes()
      .then(setNotes)
      .catch(() => setNotes([]))
  }, [refreshKey])

  if (notes === null) {
    return <p className="notes-status">Cargando notas…</p>
  }

  if (notes.length === 0) {
    return <p className="notes-status">Grabá tu primera nota 🎙️</p>
  }

  return (
    <ul className="notes-list">
      {notes.map((note, i) => (
        <NoteCard key={i} note={note} />
      ))}
    </ul>
  )
}
