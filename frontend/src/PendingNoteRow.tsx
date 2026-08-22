import type { QueueItem } from './offlineQueue'
import { formatTime } from './time'

function labelFor(item: QueueItem): string {
  if (item.blockedReason === 'AUTH_EXPIRED') return 'Sesión expirada'
  if (item.blockedReason === 'TOO_LARGE') return 'Nota muy larga'
  if (item.status === 'blocked') return 'No se pudo subir'
  return 'Audio pendiente'
}

interface Props {
  item: QueueItem
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  style?: React.CSSProperties
}

export default function PendingNoteRow({ item, onRetry, onDiscard, style }: Props) {
  const blocked = item.status === 'blocked'
  return (
    <li className={`note-card-wrapper pending-row${blocked ? ' pending-row--blocked' : ''}`} style={style}>
      <div className="note-card pending-card">
        <SoundWaveIcon />
        <span className="note-time">{formatTime(item.createdAt)}</span>
        <span className="pending-label">{labelFor(item)}</span>
        {blocked && (
          <span className="pending-actions">
            <button onClick={() => onRetry(item.id)}>Reintentar</button>
            <button onClick={() => onDiscard(item.id)}>Descartar</button>
          </span>
        )}
      </div>
    </li>
  )
}

function SoundWaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="pending-wave">
      <rect x="1" y="9" width="2" height="6" rx="1" fill="currentColor" />
      <rect x="5" y="5" width="2" height="14" rx="1" fill="currentColor" />
      <rect x="9" y="2" width="2" height="20" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="2" height="12" rx="1" fill="currentColor" />
      <rect x="17" y="9" width="2" height="6" rx="1" fill="currentColor" />
      <rect x="21" y="4" width="2" height="16" rx="1" fill="currentColor" />
    </svg>
  )
}
