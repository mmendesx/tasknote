import { describe, it, expect } from 'vitest'
import { orthogonalRoute, facingSideAnchor, facingSide, autoWaypoints, anchorForSide, chooseConnectorSides } from '../orthogonalRoute'
import type { DiagramElement } from '@tasknote/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAxisAligned(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] || a[1] === b[1]
}

function allSegmentsAxisAligned(pts: [number, number][]): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (!isAxisAligned(pts[i - 1], pts[i])) return false
  }
  return true
}

// ── orthogonalRoute ───────────────────────────────────────────────────────────

describe('orthogonalRoute', () => {
  it('horizontally separated (|dx| > |dy|): all segments axis-aligned, first segment horizontal', () => {
    const pts = orthogonalRoute([100, 50], [300, 90]) as [number, number][]
    // All consecutive pairs share x or y
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment must be horizontal (same y)
    expect(pts[0][1]).toBe(pts[1][1])
    // At most 2 interior bends → ≤ 4 points
    expect(pts.length).toBeLessThanOrEqual(4)
  })

  it('vertically separated (|dy| > |dx|): all segments axis-aligned, first segment vertical', () => {
    // start=[10,0], end=[20,200] → dy=200 > dx=10
    const pts = orthogonalRoute([10, 0], [20, 200]) as [number, number][]
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment must be vertical (same x)
    expect(pts[0][0]).toBe(pts[1][0])
    expect(pts.length).toBeLessThanOrEqual(4)
  })

  it('aligned on x-axis (dy=0): returns exactly [start, end] — 0 bends', () => {
    const pts = orthogonalRoute([0, 0], [200, 0])
    expect(pts).toEqual([[0, 0], [200, 0]])
  })

  it('aligned on y-axis (dx=0): returns exactly [start, end] — 0 bends', () => {
    const pts = orthogonalRoute([50, 10], [50, 90])
    expect(pts).toEqual([[50, 10], [50, 90]])
  })

  it('offset on both axes: ≤ 4 points and each consecutive pair differs in exactly one axis', () => {
    const pts = orthogonalRoute([0, 0], [100, 60]) as [number, number][]
    expect(pts.length).toBeLessThanOrEqual(4)
    for (let i = 1; i < pts.length; i++) {
      const sameX = pts[i][0] === pts[i - 1][0]
      const sameY = pts[i][1] === pts[i - 1][1]
      // Each segment runs along exactly one axis (sameX XOR sameY)
      expect(sameX || sameY).toBe(true)
    }
  })

  it('equal dx and dy uses horizontal-first rule (|dx| >= |dy|)', () => {
    // dx=100, dy=100 → horizontal-first → first segment shares y
    const pts = orthogonalRoute([0, 0], [100, 100]) as [number, number][]
    expect(pts[0][1]).toBe(pts[1][1]) // first segment horizontal
  })

  it('coincident points: no crash, returns 1-point array', () => {
    const pts = orthogonalRoute([50, 50], [50, 50])
    // Dedup collapses two identical points to one
    expect(pts.length).toBe(1)
    expect(pts[0]).toEqual([50, 50])
  })

  it('horizontal-first route: midpoint x is the arithmetic mean of start.x and end.x', () => {
    // start=[100,50], end=[300,90], midX = 200
    const pts = orthogonalRoute([100, 50], [300, 90]) as [number, number][]
    expect(pts.length).toBe(4)
    expect(pts[1][0]).toBe(200) // midX
    expect(pts[2][0]).toBe(200) // same midX
  })

  it('vertical-first route: midpoint y is the arithmetic mean of start.y and end.y', () => {
    // start=[10,0], end=[20,200], midY = 100
    const pts = orthogonalRoute([10, 0], [20, 200]) as [number, number][]
    expect(pts.length).toBe(4)
    expect(pts[1][1]).toBe(100) // midY
    expect(pts[2][1]).toBe(100)
  })
})

// ── facingSideAnchor ──────────────────────────────────────────────────────────

const rectEl: DiagramElement = {
  id: 'r1',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  stroke: '#000',
  strokeWidth: 1,
}

const ellipseEl: DiagramElement = {
  id: 'e1',
  type: 'ellipse',
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  stroke: '#000',
  strokeWidth: 1,
}

describe('facingSideAnchor — rectangle (0,0,100,60), center=(50,30)', () => {
  it('toward right [200,30]: anchor at right edge midpoint + GAP = [100, 30]', () => {
    const anchor = facingSideAnchor(rectEl, [200, 30])
    expect(anchor).toEqual([100, 30])
  })

  it('toward left [-100,30]: anchor at left edge midpoint - GAP = [0, 30]', () => {
    const anchor = facingSideAnchor(rectEl, [-100, 30])
    expect(anchor).toEqual([0, 30])
  })

  it('toward top [50,-100]: anchor at top edge midpoint - GAP = [50, 0]', () => {
    const anchor = facingSideAnchor(rectEl, [50, -100])
    expect(anchor).toEqual([50, 0])
  })

  it('toward bottom [50,200]: anchor at bottom edge midpoint + GAP = [50, 60]', () => {
    const anchor = facingSideAnchor(rectEl, [50, 200])
    expect(anchor).toEqual([50, 60])
  })

  it('ties on x-axis (|adx| === |ady|, toward right) resolve to x-dominant side', () => {
    // cx=50, cy=30; toward=[130,110] → adx=80, ady=80 → tie → x dominates → right side
    const anchor = facingSideAnchor(rectEl, [130, 110])
    expect(anchor).toEqual([100, 30])
  })
})

describe('facingSideAnchor — ellipse same bbox (0,0,100,60)', () => {
  it('toward right [200,30]: same cardinal point as rectangle → [100, 30]', () => {
    const anchor = facingSideAnchor(ellipseEl, [200, 30])
    expect(anchor).toEqual([100, 30])
  })

  it('toward top [50,-100]: top cardinal point → [50, 0]', () => {
    const anchor = facingSideAnchor(ellipseEl, [50, -100])
    expect(anchor).toEqual([50, 0])
  })

  it('toward bottom [50,200]: bottom cardinal point → [50, 60]', () => {
    const anchor = facingSideAnchor(ellipseEl, [50, 200])
    expect(anchor).toEqual([50, 60])
  })

  it('toward left [-100,30]: left cardinal point → [0, 30]', () => {
    const anchor = facingSideAnchor(ellipseEl, [-100, 30])
    expect(anchor).toEqual([0, 30])
  })
})

// ── orthogonalRoute side-aware ────────────────────────────────────────────────

describe('orthogonalRoute — side-aware', () => {
  it('right-side start + left-side end, vertically offset: exits horizontally, ≤2 bends (screenshot case)', () => {
    // A-right [230,80], B-left [300,305] → clean Z: 230,80→265,80→265,305→300,305
    const pts = orthogonalRoute([230, 80], [300, 305], 'right', 'left') as [number, number][]
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment must be horizontal (exits right side)
    expect(pts[0][1]).toBe(pts[1][1])
    // Last segment must be horizontal (enters left side)
    expect(pts[pts.length - 2][1]).toBe(pts[pts.length - 1][1])
    // ≤2 interior bends → ≤4 points
    expect(pts.length).toBeLessThanOrEqual(4)
    // Midpoint x is mean of 230 and 300 = 265
    expect(pts[1][0]).toBe(265)
  })

  it('bottom-side start + top-side end: first and last segments are vertical', () => {
    const pts = orthogonalRoute([100, 50], [200, 200], 'bottom', 'top') as [number, number][]
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment vertical (exits bottom)
    expect(pts[0][0]).toBe(pts[1][0])
    // Last segment vertical (enters top)
    expect(pts[pts.length - 2][0]).toBe(pts[pts.length - 1][0])
    expect(pts.length).toBeLessThanOrEqual(4)
  })

  it('mixed: right-side start + top-side end: ≤1 interior bend, perpendicular at both ends', () => {
    const pts = orthogonalRoute([100, 100], [300, 50], 'right', 'top') as [number, number][]
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment horizontal (exits right)
    expect(pts[0][1]).toBe(pts[1][1])
    // Last segment vertical (enters top)
    expect(pts[pts.length - 2][0]).toBe(pts[pts.length - 1][0])
    // L-shape: ≤3 points (1 interior bend)
    expect(pts.length).toBeLessThanOrEqual(3)
    // L corner at (ex, sy) = (300, 100)
    expect(pts[1]).toEqual([300, 100])
  })

  it('mixed: bottom-side start + left-side end: ≤1 interior bend, perpendicular at both ends', () => {
    const pts = orthogonalRoute([100, 100], [300, 200], 'bottom', 'left') as [number, number][]
    expect(allSegmentsAxisAligned(pts)).toBe(true)
    // First segment vertical (exits bottom)
    expect(pts[0][0]).toBe(pts[1][0])
    // Last segment horizontal (enters left)
    expect(pts[pts.length - 2][1]).toBe(pts[pts.length - 1][1])
    expect(pts.length).toBeLessThanOrEqual(3)
    // L corner at (sx, ey) = (100, 200)
    expect(pts[1]).toEqual([100, 200])
  })

  it('right-side start + left-side end at same y: 0 bends (straight horizontal)', () => {
    const pts = orthogonalRoute([100, 80], [300, 80], 'right', 'left')
    expect(pts).toEqual([[100, 80], [300, 80]])
  })

  it('top-side start + bottom-side end at same x: 0 bends (straight vertical)', () => {
    const pts = orthogonalRoute([100, 50], [100, 200], 'top', 'bottom')
    expect(pts).toEqual([[100, 50], [100, 200]])
  })

  it('degenerate coincident points with sides: no throw', () => {
    expect(() => orthogonalRoute([50, 50], [50, 50], 'right', 'left')).not.toThrow()
  })
})

// ── autoWaypoints ─────────────────────────────────────────────────────────────

describe('autoWaypoints', () => {
  it('excludes endpoints: length equals route length minus 2', () => {
    const start: [number, number] = [230, 80]
    const end: [number, number] = [300, 305]
    const route = orthogonalRoute(start, end, 'right', 'left')
    const waypoints = autoWaypoints(start, 'right', end, 'left')
    expect(waypoints.length).toBe(route.length - 2)
  })

  it('aligned case: returns [] (0 interior waypoints)', () => {
    const waypoints = autoWaypoints([100, 80], 'right', [300, 80], 'left')
    expect(waypoints).toEqual([])
  })

  it('Z-route: returns 2 interior waypoints', () => {
    const waypoints = autoWaypoints([230, 80], 'right', [300, 305], 'left')
    expect(waypoints.length).toBe(2)
    expect(waypoints[0]).toEqual([265, 80])
    expect(waypoints[1]).toEqual([265, 305])
  })

  it('L-route: returns 1 interior waypoint', () => {
    const waypoints = autoWaypoints([100, 100], 'right', [300, 50], 'top')
    expect(waypoints.length).toBe(1)
    expect(waypoints[0]).toEqual([300, 100])
  })
})

// ── facingSide ────────────────────────────────────────────────────────────────

describe('facingSide — rectangle (0,0,100,60), center=(50,30)', () => {
  it('toward right [200,30]: returns "right"', () => {
    expect(facingSide(rectEl, [200, 30])).toBe('right')
  })

  it('toward left [-100,30]: returns "left"', () => {
    expect(facingSide(rectEl, [-100, 30])).toBe('left')
  })

  it('toward top [50,-100]: returns "top"', () => {
    expect(facingSide(rectEl, [50, -100])).toBe('top')
  })

  it('toward bottom [50,200]: returns "bottom"', () => {
    expect(facingSide(rectEl, [50, 200])).toBe('bottom')
  })

  it('tie (adx === ady, toward right): resolves to "right" (x-dominant)', () => {
    // cx=50, cy=30; toward=[130,110] → adx=80, ady=80 → tie → x dominates → right
    expect(facingSide(rectEl, [130, 110])).toBe('right')
  })
})

// ── anchorForSide ───────────────────────────────────────────────────────────────

describe('anchorForSide — rectangle (0,0,100,60)', () => {
  it('returns each side midpoint (GAP=0)', () => {
    expect(anchorForSide(rectEl, 'right')).toEqual([100, 30])
    expect(anchorForSide(rectEl, 'left')).toEqual([0, 30])
    expect(anchorForSide(rectEl, 'top')).toEqual([50, 0])
    expect(anchorForSide(rectEl, 'bottom')).toEqual([50, 60])
  })
})

// ── chooseConnectorSides (clearance-based) ──────────────────────────────────────

function rectAt(id: string, x: number, y: number, w = 100, h = 50): DiagramElement {
  return { id, type: 'rectangle', x, y, width: w, height: h, stroke: '#000', strokeWidth: 2 } as DiagramElement
}

describe('chooseConnectorSides — picks the roomier axis', () => {
  it('side-by-side (X gap >> Y overlap): horizontal sides', () => {
    const a = rectAt('a', 0, 0)       // 0-100 x, 0-50 y
    const b = rectAt('b', 300, 10)    // 300-400 x, overlapping y
    expect(chooseConnectorSides(a, b)).toEqual({ startSide: 'right', endSide: 'left' })
  })

  it('stacked (Y gap >> X overlap): vertical sides', () => {
    const a = rectAt('a', 0, 0)       // 0-100 x, 0-50 y
    const b = rectAt('b', 10, 300)    // overlapping x, 300-350 y
    expect(chooseConnectorSides(a, b)).toEqual({ startSide: 'bottom', endSide: 'top' })
  })

  it('diagonal cramped channel: routes on the roomier axis (the screenshot bug)', () => {
    // A right=200/bottom=130, B left=220/top=200. X gap=20, Y gap=70 → vertical.
    const a = rectAt('a', 30, 30, 170, 100)   // right=200, bottom=130
    const b = rectAt('b', 220, 200, 170, 100) // left=220, top=200
    expect(chooseConnectorSides(a, b)).toEqual({ startSide: 'bottom', endSide: 'top' })
  })

  it('conservative tie-break: equal gaps keep the center-dominant axis', () => {
    // Symmetric diagonal, equal X/Y gaps → no override → center-dominant.
    const a = rectAt('a', 0, 0, 100, 100)     // right=100, bottom=100
    const b = rectAt('b', 200, 200, 100, 100) // left=200, top=200; gapX=gapY=100
    // centers (50,50)&(250,250): dx=dy → center tie → horizontal.
    expect(chooseConnectorSides(a, b)).toEqual({ startSide: 'right', endSide: 'left' })
  })
})
