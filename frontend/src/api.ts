import type { Coords } from './location'

export interface MeResponse {
  authenticated: boolean
  email?: string
}

export interface NoteEntry {
  row: number
  date: string
  text: string
  color: string
  place: string // nombre del lugar donde se guardó; vacío si la nota no tiene ubicación
}

export interface SaveNoteResponse {
  text: string
  spreadsheetUrl?: string
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/me')
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch('/logout', { method: 'POST' })
}

export async function fetchNotes(): Promise<NoteEntry[]> {
  const res = await fetch('/api/notes')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.notes
}

export async function fetchSpreadsheetUrl(): Promise<string> {
  const res = await fetch('/api/notes/spreadsheet')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.url
}

export class SaveNoteError extends Error {
  readonly status?: number // undefined => network failure (fetch rejected)
  readonly code?: string // backend's {"error": "..."} value, if any
  readonly retryable: boolean

  constructor(message: string, opts: { status?: number; code?: string; retryable: boolean }) {
    super(message)
    this.name = 'SaveNoteError'
    this.status = opts.status
    this.code = opts.code
    this.retryable = opts.retryable
  }
}

// `id` es el id de la nota en la cola offline. El backend lo usa como clave de
// idempotencia: si un envío llegó y se guardó pero la respuesta se perdió (iOS
// corta conexiones al volver de background), el reintento con el mismo id
// devuelve la nota ya guardada en vez de duplicarla.
export async function saveNote(
  blob: Blob,
  filename: string,
  id: string,
  coords?: Coords | null,
): Promise<SaveNoteResponse> {
  const formData = new FormData()
  formData.append('audio', blob, filename)
  formData.append('id', id)
  if (coords) {
    formData.append('lat', String(coords.lat))
    formData.append('lng', String(coords.lng))
  }

  let res: Response
  try {
    res = await fetch('/api/notes', { method: 'POST', body: formData })
  } catch {
    throw new SaveNoteError('network', { retryable: true })
  }

  if (!res.ok) {
    let code: string | undefined
    try {
      const body = await res.json()
      if (typeof body?.error === 'string') code = body.error
    } catch {
      // no/invalid JSON body — leave code undefined
    }
    // 409: el mismo id todavía se está procesando en el backend — reintentar
    // más tarde devuelve el resultado ya guardado.
    const retryable = res.status >= 500 || res.status === 409
    throw new SaveNoteError(`HTTP ${res.status}`, { status: res.status, code, retryable })
  }

  return res.json()
}

// Nota escrita (Markdown). `id` cumple el mismo rol que en saveNote: reintentar
// con el mismo id no duplica la nota.
export async function saveTextNote(text: string, id: string, coords?: Coords | null): Promise<void> {
  const res = await fetch('/api/notes/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, id, lat: coords?.lat, lng: coords?.lng }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export async function saveMood(mood: number, coords?: Coords | null): Promise<void> {
  const res = await fetch('/api/mood', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mood, lat: coords?.lat, lng: coords?.lng }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export async function updateNote(row: number, text: string): Promise<void> {
  const res = await fetch(`/api/notes/${row}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export async function updateNoteColor(row: number, color: string): Promise<void> {
  const res = await fetch(`/api/notes/${row}/color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export async function archiveNote(row: number): Promise<void> {
  const res = await fetch(`/api/notes/${row}/archive`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export async function deleteNote(row: number): Promise<void> {
  const res = await fetch(`/api/notes/${row}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}
