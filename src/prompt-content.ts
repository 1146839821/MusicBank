import type { TextRun } from '../electron/types'

/** Convert editable DOM into plain text plus emphasis, independent of browser block wrappers. */
export function readPromptContent(root: Node): { text: string; runs: TextRun[] } {
  const runs: TextRun[] = []
  function append(text: string, bold = false, italic = false) {
    if (!text) return
    const previous = runs[runs.length - 1]
    if (previous && !!previous.bold === bold && !!previous.italic === italic) previous.text += text
    else runs.push({text, bold, italic})
  }
  function isCaretPlaceholder(node: Node): boolean {
    if (node.nodeType === 3) return !node.textContent
    if (node.nodeName.toUpperCase() === 'BR') return true
    return node.childNodes.length === 1 && isCaretPlaceholder(node.childNodes[0])
  }
  function children(parent: Node, bold: boolean, italic: boolean) {
    let previousBlock = false
    for (let index = 0; index < parent.childNodes.length; index++) {
      const child = parent.childNodes[index]
      const block = ['DIV', 'P'].includes(child.nodeName.toUpperCase())
      // Empty blocks are real blank lines, including consecutive empty paragraphs.
      if (index > 0 && (block || previousBlock)) append('\n')
      if (!(block && isCaretPlaceholder(child))) walk(child, bold, italic)
      previousBlock = block
    }
  }
  function walk(node: Node, bold: boolean, italic: boolean) {
    if (node.nodeType === 3) { append(node.textContent || '', bold, italic); return }
    if (node.nodeType !== 1) return
    const element = node as Element, tag = element.nodeName.toUpperCase()
    if (tag === 'BR') { append('\n', bold, italic); return }
    const style = element.getAttribute('style') || ''
    const weight = /(?:^|;)\s*font-weight\s*:\s*([^;]+)/i.exec(style)?.[1].trim()
    const slant = /(?:^|;)\s*font-style\s*:\s*([^;]+)/i.exec(style)?.[1].trim()
    children(node, weight ? weight === 'bold' || Number(weight) >= 600 : bold || ['B','STRONG'].includes(tag), slant ? slant === 'italic' : italic || ['I','EM'].includes(tag))
  }
  children(root, false, false)
  return {text:runs.map(run => run.text).join(''), runs}
}
