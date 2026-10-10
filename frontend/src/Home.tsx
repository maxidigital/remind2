import { useCallback, useEffect, useRef, useState } from 'react'
import { logout, saveTextNote } from './api'
import Recorder from './Recorder'
import NotesList, { type NotesListHandle } from './NotesList'
import PullToRefresh from './PullToRefresh'
import Menu from './Menu'
import AppSwitcher from './AppSwitcher'
import { newId, startAutoRetry } from './offlineQueue'
import RichTextEditor from './RichTextEditor'
import { requestCoords, settleCoords, type Coords } from './location'
import MoodPrompt from './MoodPrompt'
import { shouldAskMood } from './mood'

interface Props {
  email: string
  onLoggedOut: () => void
  onOpenBreathwork: () => void
}

export default function Home({ email, onLoggedOut, onOpenBreathwork }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const notesListRef = useRef<NotesListHandle>(null)
  // Id de la nota escrita en curso: se fija al abrir el editor y se reusa en
  // cada intento de guardado, para que reintentar tras un error no la duplique.
  const [writingId, setWritingId] = useState<string | null>(null)
  const writingCoordsRef = useRef<Promise<Coords | null> | null>(null)

  function handleStartWriting() {
    // Se pide al abrir el editor para que el GPS tenga tiempo mientras se escribe.
    writingCoordsRef.current = requestCoords()
    setWritingId(newId())
  }

  useEffect(() => startAutoRetry(), [])

  // La pregunta de ánimo se evalúa al abrir la app y cada vez que vuelve a
  // primer plano: es el único momento en que una app web puede preguntar.
  const [askingMood, setAskingMood] = useState(shouldAskMood)
  useEffect(() => {
    function handleForeground() {
      if (document.visibilityState === 'visible' && shouldAskMood()) setAskingMood(true)
    }
    document.addEventListener('visibilitychange', handleForeground)
    return () => document.removeEventListener('visibilitychange', handleForeground)
  }, [])

  const handlePullRefresh = useCallback(async () => {
    await notesListRef.current?.refresh()
  }, [])

  async function handleSaveWritten(markdown: string) {
    if (!writingId) return
    await saveTextNote(markdown, writingId, await settleCoords(writingCoordsRef.current))
    setWritingId(null)
    setRefreshKey((k) => k + 1)
  }

  async function handleLogout() {
    await logout()
    onLoggedOut()
  }

  return (
    <div className="app">
      <header className="header">
        <Menu email={email} onLogout={handleLogout} />
        <div className="header-brand" title={email}>
          <img className="header-icon" src="/remind_circle.png" alt="" />
          <img className="header-logo" src="/remind.png" alt="re.mind2" />
        </div>
        <AppSwitcher onOpenBreathwork={onOpenBreathwork} />
      </header>

      <main className="notes-area">
        <PullToRefresh onRefresh={handlePullRefresh}>
          <NotesList ref={notesListRef} refreshKey={refreshKey} />
        </PullToRefresh>
      </main>

      <Recorder onSaved={() => setRefreshKey((k) => k + 1)} onWrite={handleStartWriting} />

      {/* No se superpone al editor: espera a que se cierre. */}
      {askingMood && !writingId && <MoodPrompt onClose={() => setAskingMood(false)} />}

      {writingId && (
        <RichTextEditor
          title="Nueva nota"
          initialMarkdown=""
          onSave={handleSaveWritten}
          onCancel={() => setWritingId(null)}
        />
      )}
    </div>
  )
}
