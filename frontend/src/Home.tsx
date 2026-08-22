import { useEffect, useState } from 'react'
import { logout } from './api'
import Recorder from './Recorder'
import NotesList from './NotesList'
import Menu from './Menu'
import { startAutoRetry } from './offlineQueue'

interface Props {
  email: string
  onLoggedOut: () => void
}

export default function Home({ email, onLoggedOut }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => startAutoRetry(), [])

  async function handleLogout() {
    await logout()
    onLoggedOut()
  }

  return (
    <div className="app">
      <header className="header">
        <span className="header-email" title={email}>
          re.mind2
        </span>
        <Menu onLogout={handleLogout} />
      </header>

      <main className="notes-area">
        <NotesList refreshKey={refreshKey} />
      </main>

      <Recorder onSaved={() => setRefreshKey((k) => k + 1)} />
    </div>
  )
}
