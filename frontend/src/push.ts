// Notificaciones push de la pregunta de ánimo. El aviso lo dispara el
// servidor cada tantas horas; acá solo se suscribe/desuscribe este dispositivo.

/**
 * En iPhone esto solo da true con la app agregada a la pantalla de inicio:
 * Safari común no expone PushManager.
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export async function isPushEnabled(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  const existing = await navigator.serviceWorker.getRegistration()
  return !!(await existing?.pushManager.getSubscription())
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function post(path: string, endpoint: string): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export type EnablePushResult = 'enabled' | 'denied'

/** Tiene que llamarse desde un toque del usuario: el navegador solo pide el permiso así. */
export async function enablePush(): Promise<EnablePushResult> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'

  const keyResponse = await fetch('/api/push/key')
  if (!keyResponse.ok) throw new Error(`HTTP ${keyResponse.status}`)
  const { key } = await keyResponse.json()

  const worker = await registration()
  const subscription = await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(key),
  })
  await post('/api/push/subscribe', subscription.endpoint)
  return 'enabled'
}

export async function disablePush(): Promise<void> {
  const existing = await navigator.serviceWorker.getRegistration()
  const subscription = await existing?.pushManager.getSubscription()
  if (!subscription) return
  await subscription.unsubscribe()
  await post('/api/push/unsubscribe', subscription.endpoint)
}
