import { describe, it, expect } from 'vitest'
import type { DiagramElement } from '@tasknote/shared'
import { reanchorConnectorsForMovedShapes } from '../connectors'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRect(id: string, x: number, y: number, width: number, height: number): DiagramElement {
  return { id, type: 'rectangle', x, y, width, height, stroke: '#000', strokeWidth: 2 }
}

function makeArrow(
  id: string,
  points: [[number, number], [number, number]],
  startBinding: { elementId: string } | null = null,
  endBinding: { elementId: string } | null = null,
): DiagramElement {
  return { id, type: 'arrow', points, stroke: '#000', strokeWidth: 2, startBinding, endBinding }
}

function makeLine(
  id: string,
  points: [[number, number], [number, number]],
): DiagramElement {
  return { id, type: 'line', points, stroke: '#000', strokeWidth: 2 }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reanchorConnectorsForMovedShapes', () => {
  // AC 1: Arrow with endBinding → rectangle R, start unbound at a raw point.
  // R is in the moved set (positioned at its NEW location in elements).
  // → patch present; end point lies on R's perimeter facing the start; start unchanged.
  it('re-anchors the bound end to the shape perimeter and leaves the unbound start unchanged', () => {
    // R is a 100×60 rect positioned at (200, 0) (its NEW location after the move).
    // Center of R: (250, 30). Start raw point at (0, 30) — directly to R's left.
    // Unbound start remains at (0, 30); bound end anchors to R's left edge facing (0,30).
    // R's left edge is x=200; gap=4 → x=196, y=30.
    const R = makeRect('R', 200, 0, 100, 60)
    const arrow = makeArrow(
      'a1',
      [[0, 30], [999, 999]], // stored end at a stale position
      null,
      { elementId: 'R' },
    )

    const patches = reanchorConnectorsForMovedShapes([R, arrow], new Set(['R']))

    expect(patches).toHaveLength(1)
    const { patch } = patches[0]
    expect(patches[0].id).toBe('a1')

    // Start (unbound) is unchanged
    expect(patch.points[0][0]).toBeCloseTo(0, 5)
    expect(patch.points[0][1]).toBeCloseTo(30, 5)

    // End anchors to R's left perimeter facing (0, 30): x=200−4=196, y=30
    expect(patch.points[1][0]).toBeCloseTo(196, 5)
    expect(patch.points[1][1]).toBeCloseTo(30, 5)
  })

  // AC 2: Arrow bound BOTH ends (A start, B end), both in moved set.
  // → both points recomputed (each on its shape perimeter, facing the other shape's center).
  it('recomputes both endpoints when both bindings are in the moved set', () => {
    // A: 100×60 rect at (0, 0) — center (50, 30). B: 100×60 rect at (200, 0) — center (250, 30).
    // Both centers at y=30, A's right edge = x=100 → gap=4 → x=104; B's left edge = x=200 → gap=4 → x=196.
    const A = makeRect('A', 0, 0, 100, 60)
    const B = makeRect('B', 200, 0, 100, 60)
    const arrow = makeArrow(
      'a1',
      [[999, 999], [888, 888]], // both stale
      { elementId: 'A' },
      { elementId: 'B' },
    )

    const patches = reanchorConnectorsForMovedShapes([A, B, arrow], new Set(['A', 'B']))

    expect(patches).toHaveLength(1)
    const { patch } = patches[0]

    // Start anchors to A's right perimeter facing B's center (250, 30)
    expect(patch.points[0][0]).toBeCloseTo(104, 5)
    expect(patch.points[0][1]).toBeCloseTo(30, 5)

    // End anchors to B's left perimeter facing A's center (50, 30)
    expect(patch.points[1][0]).toBeCloseTo(196, 5)
    expect(patch.points[1][1]).toBeCloseTo(30, 5)
  })

  // AC 3: Arrow with startBinding A (in set), endBinding B (NOT in set).
  // → patch present; start re-anchored to A; end (on B) still recomputed toward A.
  // Note: the end *is* recomputed. The fixture is arranged so that B's
  // geometry is unchanged, so the resulting endpoint matches the stored value —
  // but the code path for recompute is exercised.
  it('emits a patch when only one binding shape is in the moved set', () => {
    // A at (0,0) 100×60, center (50,30). B at (200,0) 100×60, center (250,30).
    // Only A in moved set. Start→A anchors to A's right edge toward B's center: x=104, y=30.
    // End→B anchors to B's left edge toward A's center: x=196, y=30.
    const A = makeRect('A', 0, 0, 100, 60)
    const B = makeRect('B', 200, 0, 100, 60)
    const arrow = makeArrow(
      'a1',
      [[999, 999], [196, 30]], // end already at expected anchor (but recomputed anyway)
      { elementId: 'A' },
      { elementId: 'B' },
    )

    const patches = reanchorConnectorsForMovedShapes([A, B, arrow], new Set(['A']))

    expect(patches).toHaveLength(1)
    const { patch } = patches[0]

    // Start anchors to A's right perimeter facing B's center
    expect(patch.points[0][0]).toBeCloseTo(104, 5)
    expect(patch.points[0][1]).toBeCloseTo(30, 5)

    // End is recomputed toward A's center — same geometry as before since B didn't move
    expect(patch.points[1][0]).toBeCloseTo(196, 5)
    expect(patch.points[1][1]).toBeCloseTo(30, 5)
  })

  // AC 4: Free line, no bindings → NOT in output.
  it('does not include a free line with no bindings', () => {
    const line = makeLine('l1', [[0, 0], [100, 100]])

    const patches = reanchorConnectorsForMovedShapes([line], new Set(['anything']))

    expect(patches).toHaveLength(0)
  })

  // AC 5: Arrow with endBinding referencing id "X" that is NOT in elements (deleted)
  //        and startBinding A in set → no crash; start re-anchors; the dangling end
  //        keeps its current raw point.
  it('handles a dangling binding gracefully — start re-anchors, dangling end keeps its raw point', () => {
    // A at (0, 0) 100×60, center (50, 30). "X" does not exist in elements.
    // Start→A, from=dangling end's raw point (200, 30): anchors to A's right edge → x=104, y=30.
    // End→X (dangling): keeps raw point [200, 30].
    const A = makeRect('A', 0, 0, 100, 60)
    const arrow = makeArrow(
      'a1',
      [[999, 999], [200, 30]],
      { elementId: 'A' },
      { elementId: 'X' }, // X is NOT in elements
    )

    let patches: ReturnType<typeof reanchorConnectorsForMovedShapes>
    expect(() => {
      patches = reanchorConnectorsForMovedShapes([A, arrow], new Set(['A']))
    }).not.toThrow()

    expect(patches!).toHaveLength(1)
    const { patch } = patches![0]

    // Start anchors to A's right perimeter; from = dangling end's raw point (200, 30)
    expect(patch.points[0][0]).toBeCloseTo(104, 5)
    expect(patch.points[0][1]).toBeCloseTo(30, 5)

    // End (dangling binding) keeps its raw point
    expect(patch.points[1][0]).toBeCloseTo(200, 5)
    expect(patch.points[1][1]).toBeCloseTo(30, 5)
  })

  // Extra: connector with bindings outside the moved set is absent from output.
  it('does not include a connector whose bindings are all outside the moved set', () => {
    const A = makeRect('A', 0, 0, 100, 60)
    const B = makeRect('B', 200, 0, 100, 60)
    const arrow = makeArrow('a1', [[104, 30], [196, 30]], { elementId: 'A' }, { elementId: 'B' })

    // Only 'C' moved — arrow references A and B, neither in the set
    const patches = reanchorConnectorsForMovedShapes([A, B, arrow], new Set(['C']))

    expect(patches).toHaveLength(0)
  })
})
