// Formato de grabación según el navegador: webm en Chrome/Android, mp4 en
// Safari/iOS. Whisper elige el decodificador por la extensión del archivo.

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}
