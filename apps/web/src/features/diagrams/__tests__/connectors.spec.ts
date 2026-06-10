import { describe, it, expect, afterEach } from 'vitest'
import type { DiagramElement } from '@tasknote/shared'
import { elementCenter, resolveShapeIdAtPoint, findShapeAtScenePoint } from '../connectors'

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

// ── findShapeAtScenePoint ─────────────────────────────────────────────────────

describe('findShapeAtScenePoint', () => {
  describe('endpoint dropped on a rectangle binds to it', () => {
    it('returns rect id when scene point is inside rectangle', () => {
      const rect = makeRect('target', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 150, y: 140 }, [rect])
      expect(result).toBe('target')
    })

    it('boundary: point exactly on the left edge counts as inside', () => {
      const rect = makeRect('r1', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 100, y: 140 }, [rect])
      expect(result).toBe('r1')
    })

    it('boundary: point exactly on the right edge counts as inside', () => {
      const rect = makeRect('r1', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 200, y: 140 }, [rect])
      expect(result).toBe('r1')
    })

    it('boundary: point exactly on the top edge counts as inside', () => {
      const rect = makeRect('r1', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 150, y: 100 }, [rect])
      expect(result).toBe('r1')
    })

    it('boundary: point exactly on the bottom edge counts as inside', () => {
      const rect = makeRect('r1', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 150, y: 180 }, [rect])
      expect(result).toBe('r1')
    })
  })

  describe('endpoint dropped on empty canvas stays unbound', () => {
    it('returns null when no shapes are present', () => {
      const result = findShapeAtScenePoint({ x: 150, y: 140 }, [])
      expect(result).toBeNull()
    })

    it('returns null when point is outside all shapes', () => {
      const rect = makeRect('r1', 100, 100, 100, 80)
      const result = findShapeAtScenePoint({ x: 50, y: 50 }, [rect])
      expect(result).toBeNull()
    })
  })

  describe('topmost shape wins overlapping drop', () => {
    it('returns the id of the shape later in the array (rendered on top)', () => {
      const bottom = makeRect('bottom', 0, 0, 200, 200)
      const top = makeRect('top', 50, 50, 100, 100)
      // point (100, 100) is inside both; 'top' is later in array = topmost
      const result = findShapeAtScenePoint({ x: 100, y: 100 }, [bottom, top])
      expect(result).toBe('top')
    })

    it('falls back to the lower shape when point is outside the top shape', () => {
      const bottom = makeRect('bottom', 0, 0, 200, 200)
      const top = makeRect('top', 50, 50, 100, 100)
      // point (10, 10) is inside bottom only
      const result = findShapeAtScenePoint({ x: 10, y: 10 }, [bottom, top])
      expect(result).toBe('bottom')
    })
  })

  describe('geometric hit-test needs no DOM', () => {
    it('resolves correctly even when document.elementFromPoint is overridden to throw', () => {
      // Install a sentinel that throws if called — proves findShapeAtScenePoint
      // never reaches the DOM path regardless of jsdom support.
      const original = (document as any).elementFromPoint
      ;(document as any).elementFromPoint = () => {
        throw new Error('elementFromPoint must not be called by findShapeAtScenePoint')
      }

      const rect = makeRect('r1', 0, 0, 100, 100)
      let result: string | null = null
      try {
        result = findShapeAtScenePoint({ x: 50, y: 50 }, [rect])
      } finally {
        ;(document as any).elementFromPoint = original
      }

      expect(result).toBe('r1')
    })
  })

  describe('ellipse hit-test', () => {
    it('returns ellipse id when point is inside the ellipse perimeter', () => {
      // ellipse centered at (100,75), rx=50, ry=25
      const ellipse = makeEllipse('e1', 50, 50, 100, 50)
      const result = findShapeAtScenePoint({ x: 100, y: 75 }, [ellipse])
      expect(result).toBe('e1')
    })

    it('returns null for a point outside the ellipse perimeter but inside its bbox', () => {
      // ellipse centered at (100,75), rx=50, ry=25
      // corner of bbox at (50,50): ((50-100)/50)^2 + ((50-75)/25)^2 = 1 + 1 = 2 > 1 → outside
      const ellipse = makeEllipse('e1', 50, 50, 100, 50)
      const result = findShapeAtScenePoint({ x: 52, y: 52 }, [ellipse])
      expect(result).toBeNull()
    })

    it('does not hit an ellipse with zero radius', () => {
      const ellipse = makeEllipse('e1', 100, 100, 0, 0)
      const result = findShapeAtScenePoint({ x: 100, y: 100 }, [ellipse])
      expect(result).toBeNull()
    })
  })

  describe('non-bindable shapes are ignored', () => {
    it('does not match arrows', () => {
      const arrow = makeArrow('a1')
      const result = findShapeAtScenePoint({ x: 5, y: 5 }, [arrow])
      expect(result).toBeNull()
    })

    it('does not match text elements', () => {
      const text = makeText('t1')
      const result = findShapeAtScenePoint({ x: 0, y: 0 }, [text])
      expect(result).toBeNull()
    })
  })
})
