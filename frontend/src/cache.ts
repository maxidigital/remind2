import type { MeResponse, NoteEntry } from './api'

// Copia local de la sesión y las notas: al abrir la app se muestran al
// instante y después se reemplazan por lo que devuelva el servidor. Se borra
// al cerrar sesión para no dejar notas de otra cuenta en el dispositivo.

const ME_KEY = 're.mind2.cache.me'
const NOTES_KEY = 're.mind2.cache.notes'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin espacio o sin almacenamiento: la app funciona igual, solo que sin caché.
  }
}

export function cachedMe(): MeResponse | null {
  const me = read<MeResponse>(ME_KEY)
  return me?.authenticated ? me : null
}

export function cacheMe(me: MeResponse): void {
  if (me.authenticated) write(ME_KEY, me)
  else clearCache()
}

export function cachedNotes(): NoteEntry[] | null {
  return read<NoteEntry[]>(NOTES_KEY)
}

export function cacheNotes(notes: NoteEntry[]): void {
  write(NOTES_KEY, notes)
}

export function clearCache(): void {
  try {
    localStorage.removeItem(ME_KEY)
    localStorage.removeItem(NOTES_KEY)
  } catch {
    // nada que borrar
  }
}
