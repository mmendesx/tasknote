import { describe, it, expect } from 'vitest'
import type { DiagramElement } from '@tasknote/shared'
import { computeContentBbox, buildExportSvg } from '../exportDiagram'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeRect(overrides: Partial<Extract<DiagramElement, { type: 'rectangle' }>> = {}): DiagramElement {
  return {
    id: 'r1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    stroke: 'currentColor',
    fill: null,
    strokeWidth: 2,
    ...overrides,
  }
}

function makeArrow(overrides: Partial<Extract<DiagramElement, { type: 'arrow' }>> = {}): DiagramElement {
  return {
    id: 'a1',
    type: 'arrow',
    points: [[0, 0], [100, 100]],
    stroke: 'currentColor',
    strokeWidth: 2,
    ...overrides,
  }
}

function makeText(overrides: Partial<Extract<DiagramElement, { type: 'text' }>> = {}): DiagramElement {
  return {
    id: 't1',
    type: 'text',
    x: 10,
    y: 20,
    text: 'hello',
    fontSize: 16,
    color: 'currentColor',
    ...overrides,
  }
}

// ── computeContentBbox ────────────────────────────────────────────────────────

describe('computeContentBbox', () => {
  it('returns null when elements array is empty', () => {
    expect(computeContentBbox([])).toBeNull()
  })

  it('returns bbox of a single rectangle', () => {
    const bbox = computeContentBbox([makeRect()])
    expect(bbox).toEqual({ x: 0, y: 0, width: 300, height: 200 })
  })
})

// ── buildExportSvg ────────────────────────────────────────────────────────────

describe('buildExportSvg', () => {
  it('export svg crops to content: viewBox and dimensions match content + padding', () => {
    // Elements spanning x 0–300, y 0–200 with default padding 16
    const elements: DiagramElement[] = [makeRect({ x: 0, y: 0, width: 300, height: 200 })]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    expect(svg).toContain('viewBox="-16 -16 332 232"')
    expect(svg).toContain('width="332"')
    expect(svg).toContain('height="232"')
  })

  it('export bakes currentColor: stroke currentColor is replaced with resolvedColor', () => {
    const elements: DiagramElement[] = [makeRect({ stroke: 'currentColor' })]
    const svg = buildExportSvg(elements, { resolvedColor: '#e5e7eb' })

    expect(svg).toContain('stroke="#e5e7eb"')
    expect(svg).not.toContain('currentColor')
  })

  it('literal colors pass through unchanged', () => {
    const elements: DiagramElement[] = [makeRect({ stroke: '#e03131' })]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    expect(svg).toContain('stroke="#e03131"')
  })

  it('background rect is emitted for png path when background is set', () => {
    const elements: DiagramElement[] = [makeRect()]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000', background: '#111827' })

    // The background rect must appear before the element content
    const bgIndex = svg.indexOf('fill="#111827"')
    const elIndex = svg.indexOf('<rect x="0"')
    expect(bgIndex).toBeGreaterThanOrEqual(0)
    expect(bgIndex).toBeLessThan(elIndex)
  })

  it('no background rect when background is null', () => {
    const elements: DiagramElement[] = [makeRect()]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000', background: null })

    // The only fill in the SVG should be 'none' (the empty rect)
    expect(svg).not.toContain('fill="#')
  })

  it('text content is xml-escaped', () => {
    const elements: DiagramElement[] = [
      makeText({ text: 'a<b & "c"' }),
    ]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    expect(svg).toContain('a&lt;b &amp; &quot;c&quot;')
    expect(svg).not.toContain('a<b')
  })

  it('no selection artifacts in output', () => {
    const elements: DiagramElement[] = [makeRect()]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    expect(svg).not.toContain('diagram-selection')
    expect(svg).not.toContain('diagram-marquee')
    expect(svg).not.toContain('diagram-hit-target')
  })

  it('arrow uses per-color marker matching its stroke', () => {
    const elements: DiagramElement[] = [makeArrow({ stroke: '#ff0000' })]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    // A marker def with fill matching the arrow stroke must exist
    expect(svg).toContain('fill="#ff0000"')
    // The arrow line must reference a marker-end
    expect(svg).toContain('marker-end="url(#')
  })

  it('two arrows with different strokes get distinct markers', () => {
    const elements: DiagramElement[] = [
      makeArrow({ id: 'a1', stroke: '#ff0000', points: [[0, 0], [50, 50]] }),
      makeArrow({ id: 'a2', stroke: '#0000ff', points: [[10, 10], [60, 60]] }),
    ]
    const svg = buildExportSvg(elements, { resolvedColor: '#000000' })

    // Both colors must appear as marker fills
    const redMarkerCount = (svg.match(/fill="#ff0000"/g) ?? []).length
    const blueMarkerCount = (svg.match(/fill="#0000ff"/g) ?? []).length
    expect(redMarkerCount).toBeGreaterThanOrEqual(1)
    expect(blueMarkerCount).toBeGreaterThanOrEqual(1)
  })

  it('pen elements are serialized as polyline', () => {
    const pen: DiagramElement = {
      id: 'p1',
      type: 'pen',
      points: [[0, 0], [10, 20], [30, 5]],
      stroke: 'currentColor',
      strokeWidth: 1.5,
    }
    const svg = buildExportSvg([pen], { resolvedColor: '#333333' })

    expect(svg).toContain('<polyline')
    expect(svg).toContain('0,0 10,20 30,5')
    expect(svg).toContain('stroke="#333333"')
  })

  it('empty elements array produces a minimal valid SVG', () => {
    const svg = buildExportSvg([], { resolvedColor: '#000000' })

    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })
})
