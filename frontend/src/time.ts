export function formatTime(input: string | number | Date): string {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : ''
  }
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
