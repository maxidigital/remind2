import { useEffect, useState } from 'react'
import { saveNote, SaveNoteError } from './api'

export interface QueueItem {
  id: string
  blob: Blob
  filename: string
  createdAt: number
  attemptCount: number
  lastError?: string
  lastAttemptAt?: number
  status: 'pending' | 'blocked'
  blockedReason?: 'AUTH_EXPIRED' | 'TOO_LARGE'
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

function newId(): string {
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

export async function enqueue(blob: Blob, filename: string): Promise<string> {
  const id = newId()
  const item: QueueItem = {
    id,
    blob,
    filename,
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

export async function updateItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  const current = await getItem(id)
  if (!current) return
  const updated = { ...current, ...patch }
  await withStore('readwrite', (store) => store.put(updated))
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

type AttemptResult = 'success' | 'retryable' | 'blocked'

export async function attemptUpload(item: QueueItem): Promise<AttemptResult> {
  try {
    await saveNote(item.blob, item.filename)
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
        return 'blocked'
      }
      if (err.status === 413) {
        await markBlocked(item.id, 'TOO_LARGE')
        return 'blocked'
      }
    }
    await markBlocked(item.id, undefined)
    return 'blocked'
  }
}

let flushing = false

export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const items = (await listAll()).filter((item) => item.status === 'pending')
    for (const item of items) {
      const result = await attemptUpload(item)
      if (result === 'retryable') break
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

export function startAutoRetry(): () => void {
  flushQueue()

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
