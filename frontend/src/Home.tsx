import { useState } from 'react'
import { logout } from './api'
import Recorder from './Recorder'
import NotesList from './NotesList'

interface Props {
  email: string
  onLoggedOut: () => void
}

export default function Home({ email, onLoggedOut }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)

  async function handleLogout() {
    await logout()
    onLoggedOut()
  }

  return (
    <div className="app">
      <header className="header">
        <span className="header-email">{email}</span>
        <button className="btn-link" onClick={handleLogout}>
          Salir
        </button>
      </header>

      <main className="notes-area">
        <NotesList refreshKey={refreshKey} />
      </main>

      <Recorder onSaved={() => setRefreshKey((k) => k + 1)} />
    </div>
  )
}
