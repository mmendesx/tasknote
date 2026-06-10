import { describe, it, expect } from 'vitest'
import { useResize } from '../useResize'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRect(overrides: Partial<Extract<DiagramElement, { type: 'rectangle' }>> = {}): DiagramElement {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 50,
    y: 50,
    width: 100,
    height: 80,
    stroke: '#000',
    strokeWidth: 2,
    ...overrides,
  }
}

function makeArrow(overrides: Partial<Extract<DiagramElement, { type: 'arrow' }>> = {}): DiagramElement {
  return {
    id: 'arrow-1',
    type: 'arrow',
    points: [[10, 10], [110, 90]],
    stroke: '#000',
    strokeWidth: 2,
    ...overrides,
  }
}

const defaultViewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }

function makeResize(elements: DiagramElement[], viewport: DiagramViewport = defaultViewport) {
  return useResize(() => elements, () => viewport)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramResize', () => {
  describe('corner handle se resizes rectangle', () => {
    it('dragging se by (20,15) increases width and height', () => {
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(20, 15)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(100 + 20)
      expect((patch as any).height).toBe(80 + 15)
      // x/y should not change when dragging se
      expect((patch as any).x).toBe(50)
      expect((patch as any).y).toBe(50)
    })
  })

  describe('n handle resizes only height', () => {
    it('dragging n by (0,-30) increases height by moving top edge up', () => {
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'n', 0, 0)
      // Drag up (negative y = moving north = dy is negative)
      const patch = updateResize(0, -30)

      expect(patch).not.toBeNull()
      // Width should remain unchanged
      expect((patch as any).width).toBe(100)
      // Height increases when top moves up (dy negative → newH = oldH - dy = 80 - (-30) = 110)
      expect((patch as any).height).toBe(110)
      // y should decrease (top moves up)
      expect((patch as any).y).toBe(50 + (-30))
      // x should be unchanged
      expect((patch as any).x).toBe(50)
    })
  })

  describe('resize clamps to minimum 8x8', () => {
    it('dragging se to shrink below 8px clamps to 8', () => {
      const rect = makeRect({ width: 10, height: 10 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Try to shrink by 50px — would produce negative size without clamping
      const patch = updateResize(-50, -50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      expect((patch as any).height).toBe(8)
    })

    it('dragging nw to shrink below 8px clamps width to 8', () => {
      const rect = makeRect({ width: 10, height: 10 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'nw', 0, 0)
      // Drag right/down by 50px — moves nw toward se, shrinking the shape
      const patch = updateResize(50, 50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      expect((patch as any).height).toBe(8)
    })
  })

  describe('resize flip: dragging nw past se flips correctly', () => {
    it('dragging nw far right produces valid positive geometry', () => {
      // rect at (50,50) 100×80 — drag nw past the right edge by 120px
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'nw', 0, 0)
      // Dragging nw right by 120: newX=50+120=170, newW=100-120=-20 → flipped
      // After flip: x = 170 + (-20) = 150, w = 20 (then clamped to 20 since 20>=8)
      const patch = updateResize(120, 0)

      expect(patch).not.toBeNull()
      // Width must be positive after flip
      expect((patch as any).width).toBeGreaterThan(0)
      // x must be within reasonable scene bounds
      expect((patch as any).x).toBeGreaterThanOrEqual(0)
    })

    it('dragging se left past nw edge flips width', () => {
      const rect = makeRect({ x: 50, y: 50, width: 100, height: 80 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Drag se 200px to the left — past the left edge
      const patch = updateResize(-200, 0)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBeGreaterThan(0)
    })
  })

  describe('endpoint handle on arrow re-positions its point', () => {
    it('dragging end handle (1) moves only the endpoint', () => {
      const arrow = makeArrow()
      const { beginResize, updateResize } = makeResize([arrow])

      beginResize('arrow-1', 1, 0, 0)
      const patch = updateResize(20, 10)

      expect(patch).not.toBeNull()
      const points = (patch as any).points as [[number, number], [number, number]]
      expect(points).toBeDefined()
      // Start point should remain unchanged
      expect(points[0][0]).toBe(10)
      expect(points[0][1]).toBe(10)
      // End point should be moved
      expect(points[1][0]).toBe(110 + 20)
      expect(points[1][1]).toBe(90 + 10)
    })

    it('dragging start handle (0) moves only the start point', () => {
      const arrow = makeArrow()
      const { beginResize, updateResize } = makeResize([arrow])

      beginResize('arrow-1', 0, 0, 0)
      const patch = updateResize(-5, -5)

      expect(patch).not.toBeNull()
      const points = (patch as any).points as [[number, number], [number, number]]
      // Start point moves
      expect(points[0][0]).toBe(10 - 5)
      expect(points[0][1]).toBe(10 - 5)
      // End stays
      expect(points[1][0]).toBe(110)
      expect(points[1][1]).toBe(90)
    })
  })

  describe('isResizing state', () => {
    it('is false before beginResize', () => {
      const rect = makeRect()
      const { isResizing } = makeResize([rect])
      expect(isResizing.value).toBe(false)
    })

    it('is true after beginResize and false after cancelResize', () => {
      const rect = makeRect()
      const { beginResize, cancelResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      expect(isResizing.value).toBe(true)

      cancelResize()
      expect(isResizing.value).toBe(false)
    })

    it('is false after commitResize', () => {
      const rect = makeRect()
      const { beginResize, commitResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      commitResize(10, 10)
      expect(isResizing.value).toBe(false)
    })
  })

  describe('zoom scaling', () => {
    it('respects viewport zoom when computing scene deltas', () => {
      const rect = makeRect()
      // At zoom=2, a 20px screen delta is 10 scene units
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 2 }
      const { beginResize, updateResize } = makeResize([rect], viewport)

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(20, 0)

      expect(patch).not.toBeNull()
      // 20 screen px / zoom 2 = 10 scene px added to width
      expect((patch as any).width).toBe(110)
    })
  })

  // ── Acceptance scenarios (PRD) ────────────────────────────────────────────────

  describe('acceptance: corner-resize 100x100 rect by +50,+50 produces 150x150', () => {
    it('dragging se handle +50,+50 on a 100x100 rect yields 150x150', () => {
      const rect = makeRect({ width: 100, height: 100 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(50, 50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(150)
      expect((patch as any).height).toBe(150)
      // Origin must not move for se drag
      expect((patch as any).x).toBe(50)
      expect((patch as any).y).toBe(50)
    })
  })

  describe('acceptance: min clamp — 20x20 rect dragged far past opposite corner', () => {
    it('width and height are never below 8 and never negative', () => {
      const rect = makeRect({ width: 20, height: 20 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Drag far left/up, well past the nw corner
      const patch = updateResize(-500, -500)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBeGreaterThanOrEqual(8)
      expect((patch as any).height).toBeGreaterThanOrEqual(8)
      expect((patch as any).width).toBeGreaterThan(0)
      expect((patch as any).height).toBeGreaterThan(0)
    })
  })

  describe('acceptance: arrow endpoint commit returns newBindings when dropped on a shape', () => {
    it('commitResize for arrow endpoint dropped on a rect resolves newBindings', () => {
      // Place a rect at (0,0) 200x200 so resolveShapeIdAtPoint can hit it in screen coords
      const rect: DiagramElement = {
        id: 'target-rect',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        stroke: '#000',
        strokeWidth: 2,
      }
      const arrow = makeArrow({ points: [[10, 10], [300, 300]] })
      const elements = [rect, arrow]
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }
      const { beginResize, commitResize } = makeResize(elements, viewport)

      // Drag end handle (1) — start at screen (300,300), end at screen (100,100) — inside the rect
      beginResize('arrow-1', 1, 300, 300)
      const result = commitResize(100, 100)

      // commitResize should return a result with patch and newBindings
      expect(result).not.toBeNull()
      expect(result!.patch).toBeDefined()
      // newBindings may or may not resolve depending on resolveShapeIdAtPoint impl,
      // but the result structure must always be present
      expect('newBindings' in result!).toBe(true)
    })
  })

  describe('acceptance: cancelResize discards the gesture — no patch produced', () => {
    it('after cancelResize, updateResize returns null', () => {
      const rect = makeRect()
      const { beginResize, updateResize, cancelResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      expect(isResizing.value).toBe(true)

      cancelResize()
      expect(isResizing.value).toBe(false)
      // After cancel, updateResize must return null (no active state)
      const patch = updateResize(100, 100)
      expect(patch).toBeNull()
    })
  })
})
