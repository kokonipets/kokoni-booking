// jsPDF's built-in Helvetica can't draw Chinese (or any text outside Latin-1 + common punctuation).
// patchCjkText() makes doc.text / doc.getTextWidth handle those strings by drawing them with the
// browser's own fonts onto a canvas and placing that as a small image. Plain English text is untouched,
// so PDF size and look stay the same for everything else.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = any

const WIDE = /[^\u0000-ÿ–—‘’“”•…]/
const SCALE = 4 // render at 4x so the image stays sharp when printed/zoomed
const FAMILY = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", Helvetica, Arial, sans-serif'

export const hasWideChars = (s: unknown): s is string => typeof s === 'string' && WIDE.test(s)

export function patchCjkText(doc: AnyDoc) {
  if (typeof document === 'undefined') return doc
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return doc

  const cssFont = () => {
    const f = doc.getFont?.() || {}
    const bold = /bold/i.test(f.fontStyle || '')
    const italic = /italic|oblique/i.test(f.fontStyle || '')
    return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${doc.getFontSize() * SCALE}px ${FAMILY}`
  }
  const widthPt = (s: string) => { ctx.font = cssFont(); return ctx.measureText(s).width / SCALE }

  const origWidth = doc.getTextWidth.bind(doc)
  doc.getTextWidth = (s: string) => (hasWideChars(s) ? widthPt(s) : origWidth(s))

  const origText = doc.text.bind(doc)
  doc.text = (txt: unknown, x: number, y: number, opts?: { align?: string }, ...rest: unknown[]) => {
    if (!hasWideChars(txt)) return origText(txt, x, y, opts, ...rest)
    const fs = doc.getFontSize()
    const font = cssFont()
    ctx.font = font
    const w = Math.ceil(ctx.measureText(txt).width) + 2
    const h = Math.ceil(fs * SCALE * 1.35)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const cx = c.getContext('2d')!
    cx.font = font
    cx.fillStyle = doc.getTextColor?.() || '#000000'
    cx.textBaseline = 'alphabetic'
    cx.fillText(txt, 1, Math.round(fs * SCALE)) // baseline sits fs below the image top
    const wPt = w / SCALE, hPt = h / SCALE
    const left = opts?.align === 'right' ? x - wPt : opts?.align === 'center' ? x - wPt / 2 : x
    doc.addImage(c.toDataURL('image/png'), 'PNG', left, y - fs, wPt, hPt)
    return doc
  }
  return doc
}
