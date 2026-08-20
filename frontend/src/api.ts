export interface MeResponse {
  authenticated: boolean
  email?: string
}

export interface NoteEntry {
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
