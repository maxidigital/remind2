import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { domToMarkdown, markdownToHtml } from './richText'

interface Tool {
  id: string
  label: string
  content: React.ReactNode
  isActive: () => boolean
  run: () => void
}

function inHeading(): boolean {
  return /^h[1-6]$/i.test(document.queryCommandValue('formatBlock'))
}

// Formato de caracteres y listas: comandos que el navegador prende y apaga solo.
function toggleTool(command: string, label: string, content: React.ReactNode): Tool {
  return {
    id: command,
    label,
    content,
    // Un título ya se ve en negrita: sin el chequeo, el botón B aparecería
    // prendido en todos los títulos aunque nadie haya aplicado negrita.
    isActive: () => document.queryCommandState(command) && !(command === 'bold' && inHeading()),
    run: () => document.execCommand(command),
  }
}

// Títulos: formatBlock no se apaga solo, así que tocar el botón del título
// que ya está puesto vuelve la línea a texto normal.
function headingTool(tag: 'h1' | 'h2', label: string, content: React.ReactNode): Tool {
  const isActive = () => document.queryCommandValue('formatBlock').toLowerCase() === tag
  return {
    id: tag,
    label,
    content,
    isActive,
    run: () => document.execCommand('formatBlock', false, isActive() ? 'div' : tag),
  }
}

const TOOLS: Tool[] = [
  headingTool('h1', 'Título', <span className="editor-tool-h1">T</span>),
  headingTool('h2', 'Subtítulo', <span className="editor-tool-h2">T</span>),
  toggleTool('bold', 'Negrita', <b>B</b>),
  toggleTool('italic', 'Cursiva', <i>I</i>),
  toggleTool('strikeThrough', 'Tachado', <s>S</s>),
  toggleTool('insertUnorderedList', 'Lista con viñetas', <BulletListIcon />),
  toggleTool('insertOrderedList', 'Lista numerada', <NumberedListIcon />),
]

function activeTools(): Set<string> {
  return new Set(TOOLS.filter((tool) => tool.isActive()).map((tool) => tool.id))
}

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
  const [active, setActive] = useState<Set<string>>(new Set())
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
      setActive(activeTools())
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

  function runTool(tool: Tool) {
    editorRef.current?.focus()
    tool.run()
    setMarkdown(readMarkdown())
    setActive(activeTools())
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
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`editor-tool${active.has(tool.id) ? ' editor-tool--active' : ''}`}
            aria-label={tool.label}
            aria-pressed={active.has(tool.id)}
            // Sin esto el toque le saca el foco (y la selección) al editor
            // antes de que llegue el click, y el comando no tiene a qué aplicarse.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runTool(tool)}
          >
            {tool.content}
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
