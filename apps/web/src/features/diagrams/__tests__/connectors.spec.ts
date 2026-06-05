import { describe, it, expect, vi, afterEach } from 'vitest'
import type { DiagramElement } from '@tasknote/shared'
import { elementCenter, resolveShapeIdAtPoint } from '../connectors'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRect(id: string, x: number, y: number, width: number, height: number): DiagramElement {
  return { id, type: 'rectangle', x, y, width, height, stroke: '#000', strokeWidth: 2 }
}

function makeEllipse(id: string, x: number, y: number, width: number, height: number): DiagramElement {
  return { id, type: 'ellipse', x, y, width, height, stroke: '#000', strokeWidth: 2 }
}

function makeArrow(id: string): DiagramElement {
  return {
    id,
    type: 'arrow',
    points: [[0, 0], [10, 10]],
    stroke: '#000',
    strokeWidth: 2,
  }
}

function makeText(id: string): DiagramElement {
  return { id, type: 'text', x: 0, y: 0, text: 'hello', fontSize: 14, color: '#000' }
}

function makeNodeWithId(id: string): Element {
  const node = document.createElement('div')
  node.setAttribute('data-element-id', id)
  return node
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

// jsdom does not implement elementFromPoint — we install a stub on the global
// and restore it in afterEach so tests remain independent.
function stubElementFromPoint(returnValue: Element | null): void {
  document.elementFromPoint = () => returnValue
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  // @ts-expect-error — remove the stub; jsdom had it undefined to start
  delete document.elementFromPoint
})

describe('elementCenter', () => {
  it('returns the center of a rectangle', () => {
    const rect = makeRect('r1', 10, 20, 100, 40)
    expect(elementCenter(rect)).toEqual({ x: 60, y: 40 })
  })

  it('returns the center of an ellipse', () => {
    const ellipse = makeEllipse('e1', 0, 0, 80, 60)
    expect(elementCenter(ellipse)).toEqual({ x: 40, y: 30 })
  })
})

describe('resolveShapeIdAtPoint', () => {
  it('returns the shape id when a bindable shape is under the point', () => {
    const rect = makeRect('r1', 0, 0, 100, 100)
    stubElementFromPoint(makeNodeWithId('r1'))

    const result = resolveShapeIdAtPoint(50, 50, [rect])
    expect(result).toBe('r1')
  })

  it('returns null when elementFromPoint returns null (empty canvas)', () => {
    stubElementFromPoint(null)

    const result = resolveShapeIdAtPoint(999, 999, [])
    expect(result).toBeNull()
  })

  it('returns null when the hit element is an arrow (not a bindable shape)', () => {
    const arrow = makeArrow('a1')
    stubElementFromPoint(makeNodeWithId('a1'))

    const result = resolveShapeIdAtPoint(5, 5, [arrow])
    expect(result).toBeNull()
  })

  it('returns null when the hit element is a text element (not a bindable shape)', () => {
    const text = makeText('t1')
    stubElementFromPoint(makeNodeWithId('t1'))

    const result = resolveShapeIdAtPoint(5, 5, [text])
    expect(result).toBeNull()
  })

  it('returns null when the hit element id is not in the elements list', () => {
    const rect = makeRect('r1', 0, 0, 100, 100)
    stubElementFromPoint(makeNodeWithId('unknown-id'))

    const result = resolveShapeIdAtPoint(50, 50, [rect])
    expect(result).toBeNull()
  })
})
