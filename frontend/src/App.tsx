import { useEffect, useState } from 'react'
import { fetchMe, type MeResponse } from './api'
import { cachedMe, cacheMe, clearCache } from './cache'
import Login from './Login'
import Home from './Home'
import Breathwork from './Breathwork'

type View = 'notes' | 'breathwork'

export default function App() {
  // Con una sesión guardada se entra directo a las notas mientras el servidor
  // la confirma; si ya no vale, se pasa al login.
  const [me, setMe] = useState<MeResponse | null>(cachedMe)
  const [view, setView] = useState<View>('notes')

  useEffect(() => {
    fetchMe()
      .then((fresh) => {
        cacheMe(fresh)
        setMe(fresh)
      })
      // Sin conexión se sigue con la sesión guardada, si la hay.
      .catch(() => setMe((prev) => prev ?? { authenticated: false }))
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
      onLoggedOut={() => {
        clearCache()
        setMe({ authenticated: false })
      }}
      onOpenBreathwork={() => setView('breathwork')}
    />
  )
}
