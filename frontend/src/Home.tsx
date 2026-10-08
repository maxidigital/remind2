import { useCallback, useEffect, useRef, useState } from 'react'
import { logout, saveTextNote } from './api'
import Recorder from './Recorder'
import NotesList, { type NotesListHandle } from './NotesList'
import PullToRefresh from './PullToRefresh'
import Menu from './Menu'
import AppSwitcher from './AppSwitcher'
import { newId, startAutoRetry } from './offlineQueue'
import RichTextEditor from './RichTextEditor'

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

  useEffect(() => startAutoRetry(), [])

  const handlePullRefresh = useCallback(async () => {
    await notesListRef.current?.refresh()
  }, [])

  async function handleSaveWritten(markdown: string) {
    if (!writingId) return
    await saveTextNote(markdown, writingId)
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

      <Recorder onSaved={() => setRefreshKey((k) => k + 1)} onWrite={() => setWritingId(newId())} />

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
