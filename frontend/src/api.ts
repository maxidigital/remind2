export interface MeResponse {
  authenticated: boolean
  email?: string
}

export interface NoteEntry {
  row: number
  date: string
  text: string
}

export interface SaveNoteResponse {
  text: string
  spreadsheetUrl: string
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

export async function saveNote(blob: Blob, filename: string): Promise<SaveNoteResponse> {
  const formData = new FormData()
  formData.append('audio', blob, filename)

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
    throw new SaveNoteError(`HTTP ${res.status}`, { status: res.status, code, retryable: res.status >= 500 })
  }

  return res.json()
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
