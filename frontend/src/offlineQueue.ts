import { useEffect, useState } from 'react'
import { saveNote, SaveNoteError } from './api'
import type { Coords } from './location'

export interface QueueItem {
  id: string
  blob: Blob
  filename: string
  createdAt: number
  coords?: Coords | null // dónde se grabó; se guarda acá para que un reintento posterior la conserve
  attemptCount: number
  lastError?: string
  lastAttemptAt?: number
  status: 'pending' | 'blocked'
  blockedReason?: 'AUTH_EXPIRED' | 'TOO_LARGE' | 'UNREADABLE'
}

const DB_NAME = 'remind2-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'pending'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueue(blob: Blob, filename: string, coords?: Coords | null): Promise<string> {
  const id = newId()
  const item: QueueItem = {
    id,
    blob,
    filename,
    coords,
    createdAt: Date.now(),
    attemptCount: 0,
    status: 'pending',
  }
  await withStore('readwrite', (store) => store.add(item))
  notify()
  return id
}

export async function removeItem(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
  notify()
}

async function getItem(id: string): Promise<QueueItem | undefined> {
  return withStore('readonly', (store) => store.get(id))
}

// get + put en una sola transacción: si fueran separadas, un removeItem entre
// ambas (la subida terminó justo) haría que el put resucite una nota ya subida.
export async function updateItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...patch })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  notify()
}

export async function markBlocked(id: string, reason?: QueueItem['blockedReason']): Promise<void> {
  await updateItem(id, { status: 'blocked', blockedReason: reason, lastAttemptAt: Date.now() })
}

export async function listAll(): Promise<QueueItem[]> {
  const items = await withStore<QueueItem[]>('readonly', (store) => store.getAll())
  return items.slice().sort((a, b) => a.createdAt - b.createdAt)
}

export function usePendingQueue(): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>([])

  useEffect(() => {
    let cancelled = false
    function load() {
      listAll()
        .then((result) => {
          if (!cancelled) setItems(result)
        })
        .catch(() => {
          if (!cancelled) setItems([])
        })
    }
    load()
    const unsubscribe = subscribe(load)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return items
}

type AttemptResult = 'success' | 'retryable' | 'blocked' | 'auth-expired' | 'in-flight'

// Ids de notas que se están subiendo en este momento por CUALQUIER camino
// (envío directo desde Recorder.tsx, o attemptUpload de la propia cola).
// Sin esto, mientras el envío directo de una nota recién grabada sigue en
// vuelo (Whisper puede tardar varios segundos), un flushQueue disparado por
// visibilitychange/focus/online/el intervalo de 30s la ve como 'pending' en
// IndexedDB y la reenvía por su cuenta — la nota queda guardada dos veces.
const inFlight = new Set<string>()

export function markInFlight(id: string): void {
  inFlight.add(id)
}

export function clearInFlight(id: string): void {
  inFlight.delete(id)
}

export async function attemptUpload(item: QueueItem): Promise<AttemptResult> {
  if (inFlight.has(item.id)) return 'in-flight'
  inFlight.add(item.id)
  try {
    try {
      await saveNote(item.blob, item.filename, item.id, item.coords)
      await removeItem(item.id)
      return 'success'
    } catch (err) {
      if (err instanceof SaveNoteError) {
        if (err.retryable) {
          await updateItem(item.id, {
            attemptCount: item.attemptCount + 1,
            lastError: err.message,
            lastAttemptAt: Date.now(),
          })
          return 'retryable'
        }
        if (err.status === 401) {
          await markBlocked(item.id, 'AUTH_EXPIRED')
          return 'auth-expired'
        }
        if (err.status === 413) {
          await markBlocked(item.id, 'TOO_LARGE')
          return 'blocked'
        }
        if (err.status === 422) {
          await markBlocked(item.id, 'UNREADABLE')
          return 'blocked'
        }
      }
      await markBlocked(item.id, undefined)
      return 'blocked'
    }
  } finally {
    inFlight.delete(item.id)
  }
}

let flushing = false

export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const items = (await listAll()).filter((item) => item.status === 'pending' && !inFlight.has(item.id))
    for (const item of items) {
      const result = await attemptUpload(item)
      // Con la sesión vencida los demás van a fallar igual, y cada intento
      // ya pagó una transcripción de Whisper antes de fallar en Sheets.
      if (result === 'retryable' || result === 'auth-expired') break
    }
  } finally {
    flushing = false
  }
}

export async function retryItem(id: string): Promise<void> {
  const item = await getItem(id)
  if (!item) return
  await updateItem(id, { status: 'pending' })
  await attemptUpload({ ...item, status: 'pending' })
}

export async function discardItem(id: string): Promise<void> {
  await removeItem(id)
}

const AUTO_RETRY_INTERVAL_MS = 30_000

// Los ítems bloqueados por sesión vencida no se reintentan solos; pero
// startAutoRetry corre al montar Home, o sea con el usuario ya logueado (quizás
// recién relogueado), así que es el momento de devolverlos a la cola.
async function unblockAuthExpired(): Promise<void> {
  const items = await listAll()
  for (const item of items) {
    if (item.status === 'blocked' && item.blockedReason === 'AUTH_EXPIRED') {
      await updateItem(item.id, { status: 'pending', blockedReason: undefined })
    }
  }
}

export function startAutoRetry(): () => void {
  unblockAuthExpired()
    .catch(() => {})
    .then(() => flushQueue())

  function handleOnline() {
    flushQueue()
  }
  window.addEventListener('online', handleOnline)

  // En mobile el browser pausa los timers y puede no disparar 'online' con la
  // pestaña en background; al volver a foreground (visibilitychange/focus) no
  // hay otra señal de que la conexión pudo haber vuelto, así que reintentamos ahí también.
  function handleForeground() {
    if (document.visibilityState === 'visible' && navigator.onLine) flushQueue()
  }
  document.addEventListener('visibilitychange', handleForeground)
  window.addEventListener('focus', handleForeground)

  const intervalId = window.setInterval(() => {
    if (navigator.onLine) flushQueue()
  }, AUTO_RETRY_INTERVAL_MS)

  return () => {
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('visibilitychange', handleForeground)
    window.removeEventListener('focus', handleForeground)
    window.clearInterval(intervalId)
  }
}
