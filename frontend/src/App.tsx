import { useEffect, useState } from 'react'
import { fetchMe, type MeResponse } from './api'
import Login from './Login'
import Home from './Home'
import Breathwork from './Breathwork'

type View = 'notes' | 'breathwork'

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [view, setView] = useState<View>('notes')

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMe({ authenticated: false }))
  }, [])

  if (me === null) {
    return <div className="screen-center">Cargando…</div>
  }

  if (!me.authenticated) {
    return <Login />
  }

  return view === 'breathwork' ? (
    <Breathwork onBack={() => setView('notes')} />
  ) : (
    <Home
      email={me.email ?? ''}
      onLoggedOut={() => setMe({ authenticated: false })}
      onOpenBreathwork={() => setView('breathwork')}
    />
  )
}
