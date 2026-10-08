import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { domToMarkdown, markdownToHtml } from './richText'

type Command = 'bold' | 'italic' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList'

const COMMANDS: { command: Command; label: string; content: React.ReactNode }[] = [
  { command: 'bold', label: 'Negrita', content: <b>B</b> },
  { command: 'italic', label: 'Cursiva', content: <i>I</i> },
  { command: 'strikeThrough', label: 'Tachado', content: <s>S</s> },
  { command: 'insertUnorderedList', label: 'Lista con viñetas', content: <BulletListIcon /> },
  { command: 'insertOrderedList', label: 'Lista numerada', content: <NumberedListIcon /> },
]

interface Props {
  title: string
  initialMarkdown: string
  /** Si rechaza, el editor queda abierto con un error para reintentar. */
  onSave: (markdown: string) => Promise<void> | void
  onCancel: () => void
}

export default function RichTextEditor({ title, initialMarkdown, onSave, onCancel }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  // initialMarkdown tal como lo devuelve el editor sin tocar nada, para saber
  // si hay cambios que descartar (domToMarkdown normaliza espacios).
  const untouchedRef = useRef(initialMarkdown)
  const [active, setActive] = useState<Set<Command>>(new Set())
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = markdownToHtml(initialMarkdown)
    untouchedRef.current = domToMarkdown(editor)
    setMarkdown(untouchedRef.current)
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    try {
      // Tags (<b>, <i>) en vez de <span style>, y <div> por línea en todos los
      // navegadores: es lo que domToMarkdown espera leer.
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand('defaultParagraphSeparator', false, 'div')
    } catch {
      // comando no soportado — domToMarkdown igual entiende las variantes
    }
  }, [])

  useEffect(() => {
    function refreshActive() {
      const editor = editorRef.current
      const anchor = window.getSelection()?.anchorNode
      if (!editor || !anchor || !editor.contains(anchor)) return
      setActive(new Set(COMMANDS.map((c) => c.command).filter((command) => document.queryCommandState(command))))
    }
    document.addEventListener('selectionchange', refreshActive)
    return () => document.removeEventListener('selectionchange', refreshActive)
  }, [])

  // En iOS el teclado no achica el layout viewport: un overlay `inset: 0`
  // queda con la mitad de abajo tapada y Safari lo desplaza al enfocar. Se
  // ajusta a mano al visual viewport para que el editor termine donde empieza
  // el teclado.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    function fit() {
      const overlay = overlayRef.current
      if (!overlay || !viewport) return
      overlay.style.height = `${viewport.height}px`
      overlay.style.top = `${viewport.offsetTop}px`
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
    }
  }, [])

  function readMarkdown(): string {
    return editorRef.current ? domToMarkdown(editorRef.current) : ''
  }

  function runCommand(command: Command) {
    editorRef.current?.focus()
    document.execCommand(command)
    setMarkdown(readMarkdown())
    setActive((prev) => {
      const next = new Set(prev)
      if (document.queryCommandState(command)) next.add(command)
      else next.delete(command)
      return next
    })
  }

  // Pegar desde otra app trae HTML con estilos ajenos (fuentes, colores,
  // tablas) que no se pueden guardar como Markdown: se pega solo el texto.
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  function handleCancel() {
    if (markdown !== untouchedRef.current) setConfirmDiscard(true)
    else onCancel()
  }

  async function handleSave() {
    const result = readMarkdown()
    if (!result) return
    setSaving(true)
    setError(null)
    try {
      await onSave(result)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
      setSaving(false)
    }
  }

  const isEmpty = !markdown.trim()

  return createPortal(
    <div className="editor-overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label={title}>
      <header className="editor-header">
        <button className="editor-cancel" onClick={handleCancel} disabled={saving}>
          Cancelar
        </button>
        <span className="editor-title">{title}</span>
        <button className="editor-save" onClick={handleSave} disabled={saving || isEmpty}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <div className="editor-toolbar">
        {COMMANDS.map(({ command, label, content }) => (
          <button
            key={command}
            className={`editor-tool${active.has(command) ? ' editor-tool--active' : ''}`}
            aria-label={label}
            aria-pressed={active.has(command)}
            // Sin esto el toque le saca el foco (y la selección) al editor
            // antes de que llegue el click, y el comando no tiene a qué aplicarse.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(command)}
          >
            {content}
          </button>
        ))}
      </div>

      {error && <p className="editor-error">{error}</p>}

      <div
        ref={editorRef}
        className={`editor-content rich-text${isEmpty ? ' editor-content--empty' : ''}`}
        contentEditable={!saving}
        suppressContentEditableWarning
        data-placeholder="Escribí tu nota…"
        onInput={() => setMarkdown(readMarkdown())}
        onPaste={handlePaste}
      />

      {confirmDiscard && (
        <ConfirmDialog
          message="¿Descartar lo que escribiste?"
          confirmLabel="Descartar"
          onConfirm={onCancel}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>,
    document.body,
  )
}

function BulletListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

function NumberedListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 4.5 5 4v4M4 8h2" strokeWidth="1.5" />
      <path d="M4 14.5c0-.8 2-.8 2 0 0 .7-2 1.3-2 2.5h2" strokeWidth="1.5" />
    </svg>
  )
}
