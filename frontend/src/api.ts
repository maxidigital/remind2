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

export async function saveNote(blob: Blob, filename: string): Promise<SaveNoteResponse> {
  const formData = new FormData()
  formData.append('audio', blob, filename)

  const res = await fetch('/api/notes', { method: 'POST', body: formData })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
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
