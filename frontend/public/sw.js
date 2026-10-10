// Service worker de re.mind2: existe solo para las notificaciones de la
// pregunta de ánimo. No intercepta pedidos ni cachea nada (no hay handler de
// 'fetch'), así que no cambia cómo carga la app.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// El servidor manda el push sin contenido (ver PushService.java): cualquier
// push significa "es hora de preguntar", y el texto se arma acá.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('re.mind', {
      body: '¿Cómo estás?',
      icon: '/icons/icon-192.png',
      // Mismo tag: una pregunta nueva reemplaza a la anterior sin responder en vez de apilarse.
      tag: 'mood',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (windows.length > 0) {
        // La app ya está abierta: se le avisa que muestre las caritas y se la trae al frente.
        windows[0].postMessage({ type: 'ask-mood' })
        return windows[0].focus()
      }
      return self.clients.openWindow('/?mood=1')
    })(),
  )
})
