// ── Orthogonal (elbow) connector routing ──────────────────────────────────────
//
// Point convention: [number, number] tuple — [x, y].
// All inputs and outputs in this module use this tuple form so they compose
// directly with element `points: [number,number][]` and the polyline renderer.

import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox } from './useSelection'

export type Point = [number, number]

// Mirrors connectorGeometry's module-local DEFAULT_GAP.
const GAP = 4

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove consecutive duplicate points (component-wise equality). */
function dedup(pts: Point[]): Point[] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
}

/** Determine which cardinal side of a bbox center faces toward a target x. */
function pickHorizontalSide(
  cx: number,
  bboxRight: number,
  bboxLeft: number,
  towardX: number,
): { x: number; isRight: boolean } {
  if (towardX >= cx) return { x: bboxRight, isRight: true }
  return { x: bboxLeft, isRight: false }
}

// ── orthogonalRoute ───────────────────────────────────────────────────────────

/**
 * Compute an axis-aligned elbow route between two points.
 *
 * - If start and end share an axis (dx ≈ 0 or dy ≈ 0): returns [start, end] (0 bends).
 * - |dx| >= |dy|: horizontal-first ("Z" shape), 2 bends, 4 points.
 * - |dy| > |dx|: vertical-first ("S" shape), 2 bends, 4 points.
 *
 * Consecutive duplicate points are collapsed, so the coincident case (start===end)
 * degenerates to a 1-point array.
 *
 * Pure, O(1), no DOM, no shape arguments.
 */
export function orthogonalRoute(start: Point, end: Point): Point[] {
  const [sx, sy] = start
  const [ex, ey] = end

  const dx = ex - sx
  const dy = ey - sy

  const EPSILON = 0.001

  // Axially aligned or coincident: straight segment (or degenerate point).
  if (Math.abs(dx) < EPSILON || Math.abs(dy) < EPSILON) {
    return dedup([start, end])
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal-first: start → (midX, sy) → (midX, ey) → end
    const midX = (sx + ex) / 2
    return dedup([[sx, sy], [midX, sy], [midX, ey], [ex, ey]])
  }

  // Vertical-first: start → (sx, midY) → (ex, midY) → end
  const midY = (sy + ey) / 2
  return dedup([[sx, sy], [sx, midY], [ex, midY], [ex, ey]])
}

// ── facingSideAnchor ──────────────────────────────────────────────────────────

/**
 * Returns the midpoint of the shape side that faces `toward`, offset outward
 * by GAP (4px, mirroring connectorGeometry's DEFAULT_GAP).
 *
 * Works identically for rectangles and ellipses: the bbox side midpoint
 * coincides with the ellipse's cardinal extreme (top/bottom/left/right), so
 * no per-type trig is needed.
 *
 * Dominance rule (same tie-break as orthogonalRoute):
 *   |toward.x - cx| >= |toward.y - cy| → x-axis dominates → LEFT or RIGHT side.
 *   Otherwise → TOP or BOTTOM side.
 */
export function facingSideAnchor(shape: DiagramElement, toward: Point): Point {
  const bbox = computeElementBbox(shape)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2

  const [tx, ty] = toward
  const adx = Math.abs(tx - cx)
  const ady = Math.abs(ty - cy)

  if (adx >= ady) {
    // Left or right side
    const { x, isRight } = pickHorizontalSide(cx, bbox.x + bbox.width, bbox.x, tx)
    const offsetX = isRight ? x + GAP : x - GAP
    return [offsetX, cy]
  }

  // Top or bottom side
  if (ty >= cy) {
    // Bottom side
    return [cx, bbox.y + bbox.height + GAP]
  }
  // Top side
  return [cx, bbox.y - GAP]
}
