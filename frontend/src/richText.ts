// El formato de una nota se guarda como Markdown en la celda Text de la
// planilla (legible ahí, y las notas de audio —texto plano— son Markdown
// válido sin tocar nada). Subconjunto soportado: **negrita**, *cursiva*,
// ~~tachado~~, listas "- " y "1. ", títulos "# " y subtítulos "## ". Nada de HTML: todo lo que no sea uno de
// esos marcadores se escapa, así que el resultado de markdownToHtml es seguro
// para innerHTML.

const BOLD = /\*\*(\S(?:.*?\S)?)\*\*/g
const STRIKE = /~~(\S(?:.*?\S)?)~~/g
const ITALIC = /\*(\S(?:[^*]*\S)?)\*/g
const BULLET_ITEM = /^\s*-\s+(.*)$/
const NUMBERED_ITEM = /^\s*\d{1,3}\.\s+(.*)$/
// "#" = título (<h1>), "##" o más = subtítulo (<h2>): dos niveles alcanzan para una nota.
const HEADING = /^(#{1,6})\s+(.*)$/

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineToHtml(text: string): string {
  // Negrita antes que cursiva: si no, "**x**" se leería como cursiva de "*x*".
  return escapeHtml(text).replace(BOLD, '<b>$1</b>').replace(STRIKE, '<s>$1</s>').replace(ITALIC, '<i>$1</i>')
}

export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  let openList: 'ul' | 'ol' | null = null

  function closeList() {
    if (openList) out.push(`</${openList}>`)
    openList = null
  }

  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading) {
      closeList()
      const tag = heading[1].length === 1 ? 'h1' : 'h2'
      out.push(`<${tag}>${inlineToHtml(heading[2])}</${tag}>`)
      continue
    }
    const bullet = BULLET_ITEM.exec(line)
    const numbered = bullet ? null : NUMBERED_ITEM.exec(line)
    const list = bullet ? 'ul' : numbered ? 'ol' : null
    if (list) {
      if (openList !== list) {
        closeList()
        out.push(`<${list}>`)
        openList = list
      }
      out.push(`<li>${inlineToHtml((bullet ?? numbered)![1])}</li>`)
    } else {
      closeList()
      out.push(`<div>${inlineToHtml(line) || '<br>'}</div>`)
    }
  }
  closeList()
  return out.join('')
}

/** Texto sin marcadores, para la vista previa de una línea y para copiar/compartir. */
export function markdownToPlain(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const heading = HEADING.exec(line)
      const bullet = BULLET_ITEM.exec(line)
      const text = heading ? heading[2] : bullet ? `• ${bullet[1]}` : line
      return text.replace(BOLD, '$1').replace(STRIKE, '$1').replace(ITALIC, '$1')
    })
    .join('\n')
}

// Envuelve con el marcador solo el texto, dejando afuera los espacios de los
// bordes ("** hola**" no es negrita válida) y sin cruzar saltos de línea.
function wrap(marker: string, inner: string): string {
  return inner
    .split('\n')
    .map((line) => {
      const core = line.trim()
      if (!core) return line
      const start = line.indexOf(core)
      return line.slice(0, start) + marker + core + marker + line.slice(start + core.length)
    })
    .join('\n')
}

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/ /g, ' ')
  }
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'

  let text = Array.from(node.childNodes).map(inlineToMarkdown).join('')
  // Según el navegador, execCommand deja <b>/<i>/<strike> o un <span style>.
  const { fontWeight, fontStyle, textDecorationLine } = node.style
  const tag = node.tagName
  if (tag === 'B' || tag === 'STRONG' || fontWeight === 'bold' || Number(fontWeight) >= 600) text = wrap('**', text)
  if (tag === 'I' || tag === 'EM' || fontStyle === 'italic') text = wrap('*', text)
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || textDecorationLine.includes('line-through')) {
    text = wrap('~~', text)
  }
  return text
}

const HEADING_PREFIX: Record<string, string> = { H1: '# ', H2: '## ', H3: '## ', H4: '## ', H5: '## ', H6: '## ' }
const BLOCK_TAGS = new Set(['DIV', 'P', 'UL', 'OL', 'LI', ...Object.keys(HEADING_PREFIX)])

function collectLines(root: Node, lines: string[]): void {
  let buffer: string | null = null

  function flush() {
    if (buffer !== null) lines.push(...buffer.replace(/\n$/, '').split('\n'))
    buffer = null
  }

  for (const child of Array.from(root.childNodes)) {
    if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) {
      flush()
      let n = 0
      for (const item of Array.from(child.children)) {
        n += 1
        const text = inlineToMarkdown(item).replace(/\n+/g, ' ').trim()
        lines.push(child.tagName === 'UL' ? `- ${text}` : `${n}. ${text}`)
      }
    } else if (child instanceof HTMLElement && child.tagName in HEADING_PREFIX) {
      flush()
      const text = inlineToMarkdown(child).replace(/\n+/g, ' ').trim()
      // Un título vacío (recién creado, sin texto) no se guarda como "# " suelto.
      lines.push(text ? HEADING_PREFIX[child.tagName] + text : '')
    } else if (child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName)) {
      flush()
      const hasBlockChildren = Array.from(child.children).some((c) => BLOCK_TAGS.has(c.tagName))
      if (hasBlockChildren) {
        collectLines(child, lines)
      } else {
        lines.push(...inlineToMarkdown(child).replace(/\n$/, '').split('\n'))
      }
    } else {
      buffer = (buffer ?? '') + inlineToMarkdown(child)
    }
  }
  flush()
}

/** Lee el contenido de un contentEditable y lo devuelve como Markdown. */
export function domToMarkdown(root: HTMLElement): string {
  const lines: string[] = []
  collectLines(root, lines)
  return lines
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
