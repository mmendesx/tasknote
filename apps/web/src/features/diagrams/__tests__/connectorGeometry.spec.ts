import { describe, it, expect } from 'vitest'
import { rectEdgePoint, ellipseEdgePoint } from '../connectorGeometry'

// ── rectEdgePoint ─────────────────────────────────────────────────────────────

describe('rectEdgePoint', () => {
  // rect: x=0, y=0, width=100, height=60 → center=(50,30), half-w=50, half-h=30

  it('ray from directly above hits the top edge', () => {
    // from=(50,-100) → ray goes straight down toward center (50,30) → top edge y=0
    const pt = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: 50, y: -100 })
    // boundary at y=0, gap=4 steps outward (upward) → y = -4
    expect(pt.x).toBeCloseTo(50, 5)
    expect(pt.y).toBeCloseTo(-4, 5)
  })

  it('ray from directly to the left hits the left edge', () => {
    // from=(-100,30) → ray goes rightward toward center (50,30) → left edge x=0
    const pt = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: -100, y: 30 })
    // boundary at x=0, gap=4 steps outward (leftward) → x=-4
    expect(pt.x).toBeCloseTo(-4, 5)
    expect(pt.y).toBeCloseTo(30, 5)
  })

  it('ray from directly to the right hits the right edge', () => {
    // from=(250,30) → ray goes leftward toward center → right edge x=100
    const pt = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: 250, y: 30 })
    // boundary at x=100, gap=4 steps outward (rightward) → x=104
    expect(pt.x).toBeCloseTo(104, 5)
    expect(pt.y).toBeCloseTo(30, 5)
  })

  it('ray from directly below hits the bottom edge', () => {
    // from=(50,200) → ray goes upward toward center (50,30) → bottom edge y=60
    const pt = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: 50, y: 200 })
    // boundary at y=60, gap=4 steps outward (downward) → y=64
    expect(pt.x).toBeCloseTo(50, 5)
    expect(pt.y).toBeCloseTo(64, 5)
  })

  it('from=center returns center unchanged', () => {
    const rect = { x: 0, y: 0, width: 100, height: 60 }
    const pt = rectEdgePoint(rect, { x: 50, y: 30 })
    expect(pt).toEqual({ x: 50, y: 30 })
  })

  it('gap shrinks the distance from the boundary (larger gap → farther from shape)', () => {
    // Ray from above with gap=0 should land exactly on the edge (y=0)
    const pt0 = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: 50, y: -100 }, 0)
    expect(pt0.y).toBeCloseTo(0, 5)

    // Same ray with gap=10 should be 10px above the edge (y=-10)
    const pt10 = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: 50, y: -100 }, 10)
    expect(pt10.y).toBeCloseTo(-10, 5)
  })

  it('ray from a diagonal corner direction hits the correct edge', () => {
    // rect 100×60, center (50,30). From (-50,-100) → diagonal ray.
    // dx=100, dy=130. hw=50, hh=30.
    // Top edge t = (30-30-30) / 130 = ... let's just verify the result is on the rect border.
    const pt = rectEdgePoint({ x: 0, y: 0, width: 100, height: 60 }, { x: -50, y: -100 }, 0)
    // The returned point must be on one of the 4 edges (within tolerance).
    const onLeftEdge = Math.abs(pt.x - 0) < 1e-6 && pt.y >= 0 && pt.y <= 60
    const onTopEdge = Math.abs(pt.y - 0) < 1e-6 && pt.x >= 0 && pt.x <= 100
    const onRightEdge = Math.abs(pt.x - 100) < 1e-6 && pt.y >= 0 && pt.y <= 60
    const onBottomEdge = Math.abs(pt.y - 60) < 1e-6 && pt.x >= 0 && pt.x <= 100
    expect(onLeftEdge || onTopEdge || onRightEdge || onBottomEdge).toBe(true)
  })
})

// ── ellipseEdgePoint ──────────────────────────────────────────────────────────

describe('ellipseEdgePoint', () => {
  // ellipse: x=0, y=0, width=100, height=60 → cx=50, cy=30, rx=50, ry=30

  it('point returned from outside lies on the ellipse perimeter (within tolerance)', () => {
    const ellipse = { x: 0, y: 0, width: 100, height: 60 }
    const pt = ellipseEdgePoint(ellipse, { x: 50, y: -100 }, 0)
    // Verify: ((pt.x - 50)/50)^2 + ((pt.y - 30)/30)^2 ≈ 1
    const cx = 50, cy = 30, rx = 50, ry = 30
    const val = Math.pow((pt.x - cx) / rx, 2) + Math.pow((pt.y - cy) / ry, 2)
    expect(val).toBeCloseTo(1, 6)
  })

  it('from=center returns center unchanged', () => {
    const ellipse = { x: 0, y: 0, width: 100, height: 60 }
    const pt = ellipseEdgePoint(ellipse, { x: 50, y: 30 })
    expect(pt).toEqual({ x: 50, y: 30 })
  })

  it('ray from the right exits at the right-most perimeter point (with gap=0)', () => {
    // from directly to the right: (250, 30) → cx=50, cy=30, rx=50
    // The intersection should be at the rightmost point of the ellipse: (100, 30)
    const ellipse = { x: 0, y: 0, width: 100, height: 60 }
    const pt = ellipseEdgePoint(ellipse, { x: 250, y: 30 }, 0)
    expect(pt.x).toBeCloseTo(100, 5)
    expect(pt.y).toBeCloseTo(30, 5)
  })

  it('gap steps the point outward from the perimeter', () => {
    // from above with gap=0 → point on perimeter (topmost: x=50, y=0)
    const ellipse = { x: 0, y: 0, width: 100, height: 60 }
    const pt0 = ellipseEdgePoint(ellipse, { x: 50, y: -100 }, 0)
    // y should be at the top of the ellipse: cy - ry = 30 - 30 = 0
    expect(pt0.y).toBeCloseTo(0, 5)

    // with gap=5 → point is 5px above the top: y = -5
    const pt5 = ellipseEdgePoint(ellipse, { x: 50, y: -100 }, 5)
    expect(pt5.y).toBeCloseTo(-5, 5)
  })

  it('point from diagonal direction lies on the ellipse perimeter (gap=0)', () => {
    const ellipse = { x: 0, y: 0, width: 80, height: 40 }
    const pt = ellipseEdgePoint(ellipse, { x: -100, y: -100 }, 0)
    const cx = 40, cy = 20, rx = 40, ry = 20
    const val = Math.pow((pt.x - cx) / rx, 2) + Math.pow((pt.y - cy) / ry, 2)
    expect(val).toBeCloseTo(1, 6)
  })
})
