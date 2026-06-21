// ── Orthogonal (elbow) connector routing ──────────────────────────────────────
//
// Point convention: [number, number] tuple — [x, y].
// All inputs and outputs in this module use this tuple form so they compose
// directly with element `points: [number,number][]` and the polyline renderer.

import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox } from './useSelection'

export type Point = [number, number]

/** Cardinal side of a shape bbox. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

// Perimeter gap between a bound connector's anchor and the shape edge.
// 0 = the connector touches the shape (no visible space). Bump up to inset.
const GAP = 0

const EPSILON = 0.001

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove consecutive duplicate points (component-wise equality). */
function dedup(pts: Point[]): Point[] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
}

/**
 * Collapse runs of collinear points: drop any interior point that lies on the
 * straight axis-aligned line between its neighbours (same x across all three, or
 * same y across all three). Keeps endpoints. Idempotent — re-running on a fixed
 * leg makes no change, so a per-frame re-anchor cannot pile up redundant bends.
 */
export function collapseCollinear(pts: Point[]): Point[] {
  const deduped = dedup(pts)
  if (deduped.length <= 2) return deduped
  const out: Point[] = [deduped[0]!]
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = deduped[i]!
    const c = deduped[i + 1]!
    const sameX = Math.abs(a[0] - b[0]) < EPSILON && Math.abs(b[0] - c[0]) < EPSILON
    const sameY = Math.abs(a[1] - b[1]) < EPSILON && Math.abs(b[1] - c[1]) < EPSILON
    if (sameX || sameY) continue // b is redundant on a straight run
    out.push(b)
  }
  out.push(deduped[deduped.length - 1]!)
  return out
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

/** True when the given side exits horizontally (left or right). */
function isHorizontalSide(side: Side): boolean {
  return side === 'left' || side === 'right'
}

// ── orthogonalRoute ───────────────────────────────────────────────────────────

/**
 * Compute an axis-aligned elbow route between two points.
 *
 * WITHOUT sides (legacy spec-20 behavior):
 * - |dx| >= |dy|: horizontal-first ("Z" shape), ≤2 bends.
 * - |dy| > |dx|: vertical-first, ≤2 bends.
 * - Axially aligned or coincident: [start, end] (0 bends).
 *
 * WITH sides (side-aware):
 * - Both horizontal sides (left/right): Z route via midX. 0 bends if same y.
 * - Both vertical sides (top/bottom): Z route via midY. 0 bends if same x.
 * - Mixed (one horizontal, one vertical): L route, ≤1 interior bend.
 *
 * Consecutive duplicate points are collapsed via dedup.
 * Pure, O(1), no DOM, no shape arguments.
 *
 * ponytail: midpoint Z ignores facing-away / U-turn cases where anchors point
 * away from each other; still produces all-right-angles but may look like a
 * backward stub. Fix only if a concrete scenario demands it.
 */
export function orthogonalRoute(start: Point, end: Point, startSide?: Side, endSide?: Side): Point[] {
  const [sx, sy] = start
  const [ex, ey] = end

  // Side-aware path: both sides must be provided to enter this branch.
  if (startSide !== undefined && endSide !== undefined) {
    return routeWithSides(start, end, startSide, endSide)
  }

  // Legacy spec-20 behavior (no sides): dominant axis from anchor-to-anchor delta.
  const dx = ex - sx
  const dy = ey - sy

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

/** Side-aware inner route — called only when both sides are defined. */
function routeWithSides(start: Point, end: Point, startSide: Side, endSide: Side): Point[] {
  const [sx, sy] = start
  const [ex, ey] = end

  const startH = isHorizontalSide(startSide)
  const endH = isHorizontalSide(endSide)

  if (startH && endH) {
    // Both horizontal exits → Z route through midX.
    // Aligned on y: straight horizontal segment, 0 bends.
    if (Math.abs(sy - ey) < EPSILON) return dedup([start, end])
    const midX = (sx + ex) / 2
    return dedup([[sx, sy], [midX, sy], [midX, ey], [ex, ey]])
  }

  if (!startH && !endH) {
    // Both vertical exits → Z route through midY.
    // Aligned on x: straight vertical segment, 0 bends.
    if (Math.abs(sx - ex) < EPSILON) return dedup([start, end])
    const midY = (sy + ey) / 2
    return dedup([[sx, sy], [sx, midY], [ex, midY], [ex, ey]])
  }

  if (startH && !endH) {
    // Start exits horizontally, end enters vertically → L corner at (ex, sy).
    return dedup([[sx, sy], [ex, sy], [ex, ey]])
  }

  // Start exits vertically, end enters horizontally → L corner at (sx, ey).
  return dedup([[sx, sy], [sx, ey], [ex, ey]])
}

// ── autoWaypoints ─────────────────────────────────────────────────────────────

/**
 * Returns only the interior bend points (excludes start and end) for a
 * side-aware orthogonal route. Stores in an element's `waypoints` field (ICT-3).
 *
 * Aligned case (0 bends) → returns [].
 */
export function autoWaypoints(
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
): Point[] {
  const route = orthogonalRoute(start, end, startSide, endSide)
  return route.slice(1, -1)
}

// ── fixManualLeg ──────────────────────────────────────────────────────────────

/**
 * Regenerates the axis-aligned leg between a moved endpoint `p` (new anchor,
 * exiting perpendicular to `side`) and the array of preserved interior
 * waypoints `w` (start→end order). Only the leg adjacent to `p` is replaced;
 * interior waypoints are kept verbatim.
 *
 * `whichEnd` indicates which side of the route was moved:
 *   'start' → rebuild the leg from p to w[0]
 *   'end'   → rebuild the leg from w[last] to p
 *
 * If `w` is empty (manual but no interior waypoints) the caller should fall
 * back to auto — this function returns `undefined` in that case.
 *
 * ponytail: single-corner L; does not handle U-turns (anchor facing away).
 */
export function fixManualLeg(
  p: Point,
  side: Side,
  w: Point[],
  whichEnd: 'start' | 'end',
): Point[] | undefined {
  if (w.length === 0) return undefined

  const isH = isHorizontalSide(side)
  if (whichEnd === 'start') {
    const wAdj = w[0]!
    // Horizontal exit: move right/left first → corner at (wAdj[0], p[1])
    const corner: Point = isH ? [wAdj[0], p[1]] : [p[0], wAdj[1]]
    // collapseCollinear with p included so a previously-generated leg corner
    // (collinear with the new one) is absorbed instead of stacking — keeps
    // fixManualLeg idempotent across repeated re-anchors. Drop p from the result.
    return collapseCollinear([p, corner, ...w]).slice(1)
  }
  // 'end': exit from the last waypoint into p
  const wAdj = w[w.length - 1]!
  const corner: Point = isH ? [wAdj[0], p[1]] : [p[0], wAdj[1]]
  return collapseCollinear([...w, corner, p]).slice(0, -1)
}

// ── facingSide ────────────────────────────────────────────────────────────────

/**
 * Returns which cardinal side of `shape` faces `toward`.
 *
 * Dominance rule (mirrors facingSideAnchor):
 *   |tx - cx| >= |ty - cy| → LEFT or RIGHT.
 *   Otherwise              → TOP or BOTTOM.
 */
export function facingSide(shape: DiagramElement, toward: Point): Side {
  const bbox = computeElementBbox(shape)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2

  const [tx, ty] = toward
  const adx = Math.abs(tx - cx)
  const ady = Math.abs(ty - cy)

  if (adx >= ady) {
    return tx >= cx ? 'right' : 'left'
  }
  return ty >= cy ? 'bottom' : 'top'
}

// ── facingSideAnchor ──────────────────────────────────────────────────────────

/**
 * Returns the midpoint of the shape side that faces `toward`, offset outward
 * by GAP (0 by default → the anchor sits on the shape edge).
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
