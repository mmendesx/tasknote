import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox, unionBboxes } from './useSelection'
import type { SelectionBBox } from './useSelection'

// ── XML escape ────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Color resolution ──────────────────────────────────────────────────────────

function resolveColor(value: string, resolvedColor: string): string {
  return value === 'currentColor' ? resolvedColor : value
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Points attribute ──────────────────────────────────────────────────────────

function pointsToAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the union bounding box of all elements. Returns null when the array
 * is empty. Padding is NOT included — callers add it.
 */
export function computeContentBbox(elements: DiagramElement[]): SelectionBBox | null {
  if (elements.length === 0) return null
  return unionBboxes(elements.map(computeElementBbox))
}

export interface ExportSvgOpts {
  /** Extra space around the content on all four sides (default 16). */
  padding?: number
  /** The resolved CSS `color` value for the canvas (replaces `currentColor`). */
  resolvedColor: string
  /**
   * Background fill color. Pass a color string to emit a background rect (for
   * PNG export). Pass null/undefined for a transparent background (SVG default).
   */
  background?: string | null
}

/**
 * Serialize `elements` to a standalone SVG string.
 *
 * Arrowhead markers: we generate one `<marker>` element per distinct arrow
 * stroke color so that each arrowhead matches its line. This is necessary
 * because `context-stroke` is not reliably supported outside live browsers
 * (e.g. in canvas-drawImage-based rasterizers and some SVG renderers).
 */
export function buildExportSvg(elements: DiagramElement[], opts: ExportSvgOpts): string {
  const padding = opts.padding ?? 16
  const { resolvedColor, background } = opts

  const contentBbox = computeContentBbox(elements)
  // Fall back to a minimal viewBox when there's nothing to render.
  const cx = contentBbox?.x ?? 0
  const cy = contentBbox?.y ?? 0
  const cw = contentBbox?.width ?? 0
  const ch = contentBbox?.height ?? 0

  const vx = cx - padding
  const vy = cy - padding
  const vw = cw + 2 * padding
  const vh = ch + 2 * padding

  // ── Collect distinct arrow stroke colors for per-color markers ────────────
  const arrowStrokes = new Set<string>()
  for (const el of elements) {
    if (el.type === 'arrow') {
      arrowStrokes.add(resolveColor(el.stroke, resolvedColor))
    }
  }

  // ── Marker defs ───────────────────────────────────────────────────────────
  let markerDefs = ''
  for (const strokeColor of arrowStrokes) {
    // Safe id: strip non-alphanumeric chars so the color value is a valid XML id.
    const safeId = `diagram-arrowhead-${strokeColor.replace(/[^a-zA-Z0-9]/g, '_')}`
    markerDefs += `<marker id="${safeId}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${escapeXml(strokeColor)}"/></marker>`
  }

  // ── Element markup ────────────────────────────────────────────────────────
  let body = ''

  // Optional background rect (for PNG path)
  if (background) {
    body += `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${escapeXml(background)}"/>`
  }

  for (const el of elements) {
    if (el.type === 'rectangle') {
      const stroke = resolveColor(el.stroke, resolvedColor)
      const fill = el.fill ? resolveColor(el.fill, resolvedColor) : 'none'
      body += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${escapeXml(stroke)}" fill="${escapeXml(fill)}" stroke-width="${el.strokeWidth}"/>`
    } else if (el.type === 'ellipse') {
      const stroke = resolveColor(el.stroke, resolvedColor)
      const fill = el.fill ? resolveColor(el.fill, resolvedColor) : 'none'
      const cx2 = el.x + el.width / 2
      const cy2 = el.y + el.height / 2
      body += `<ellipse cx="${cx2}" cy="${cy2}" rx="${el.width / 2}" ry="${el.height / 2}" stroke="${escapeXml(stroke)}" fill="${escapeXml(fill)}" stroke-width="${el.strokeWidth}"/>`
    } else if (el.type === 'line') {
      const stroke = resolveColor(el.stroke, resolvedColor)
      const [[x1, y1], [x2, y2]] = el.points
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth}"/>`
    } else if (el.type === 'arrow') {
      const stroke = resolveColor(el.stroke, resolvedColor)
      const safeId = `diagram-arrowhead-${stroke.replace(/[^a-zA-Z0-9]/g, '_')}`
      const [[x1, y1], [x2, y2]] = el.points
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth}" marker-end="url(#${safeId})"/>`
    } else if (el.type === 'text') {
      const fill = resolveColor(el.color, resolvedColor)
      body += `<text x="${el.x}" y="${el.y}" font-size="${el.fontSize}" fill="${escapeXml(fill)}">${escapeXml(el.text)}</text>`
    } else if (el.type === 'pen') {
      const stroke = resolveColor(el.stroke, resolvedColor)
      const pts = pointsToAttr(el.points as [number, number][])
      body += `<polyline points="${escapeXml(pts)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth}"/>`
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}">`,
    markerDefs ? `<defs>${markerDefs}</defs>` : '',
    body,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('')
}

// ── Download helper (browser-only) ────────────────────────────────────────────

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Public export actions ─────────────────────────────────────────────────────

export function exportSvg(
  elements: DiagramElement[],
  title: string,
  resolvedColor: string,
): void {
  const svg = buildExportSvg(elements, { resolvedColor, background: null })
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const filename = `${slugify(title) || 'diagram'}.svg`
  downloadBlob(filename, blob)
}

export async function exportPng(
  elements: DiagramElement[],
  title: string,
  resolvedColor: string,
  background: string,
): Promise<void> {
  const SCALE = 2

  const contentBbox = computeContentBbox(elements)
  const padding = 16
  const vw = (contentBbox?.width ?? 0) + 2 * padding
  const vh = (contentBbox?.height ?? 0) + 2 * padding

  const svg = buildExportSvg(elements, { resolvedColor, background })

  try {
    const canvas = document.createElement('canvas')
    canvas.width = vw * SCALE
    canvas.height = vh * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2d canvas context')

    const img = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })

    ctx.scale(SCALE, SCALE)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)

    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('canvas.toBlob returned null')); return }
        const filename = `${slugify(title) || 'diagram'}.png`
        downloadBlob(filename, blob)
        resolve()
      }, 'image/png')
    })
  } catch {
    // Guard: jsdom / headless environments have no real canvas.
    // Fall back to downloading the SVG so the user isn't left with nothing.
    exportSvg(elements, title, resolvedColor)
  }
}
