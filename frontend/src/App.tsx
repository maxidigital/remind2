import { useEffect, useState } from 'react'
import { fetchMe, type MeResponse } from './api'
import Login from './Login'
import Home from './Home'

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null)

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMe({ authenticated: false }))
  }, [])

  if (me === null) {
    return <div className="screen-center">Cargando…</div>
  }

  return me.authenticated ? (
    <Home email={me.email ?? ''} onLoggedOut={() => setMe({ authenticated: false })} />
  ) : (
    <Login />
  )
}
