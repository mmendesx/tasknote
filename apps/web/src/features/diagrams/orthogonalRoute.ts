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

// ── collapseCollinear ─────────────────────────────────────────────────────────

/**
 * Remove interior points that lie on a straight axis-aligned run with both
 * their neighbours. Deduplicates first, then collapses in a single pass so a
 * run of 3+ collinear points folds down to its two run-endpoints. Idempotent.
 *
 * Use-case: prevents per-frame leg-corner pile-up when waypoints are fed back
 * as inputs on subsequent renders.
 */
export function collapseCollinear(pts: Point[]): Point[] {
  const d = dedup(pts)
  if (d.length < 3) return d
  const out: Point[] = [d[0]]
  for (let i = 1; i < d.length - 1; i++) {
    const prev = out[out.length - 1]
    const cur = d[i]
    const next = d[i + 1]
    const sameX =
      Math.abs(prev[0] - cur[0]) < EPSILON && Math.abs(cur[0] - next[0]) < EPSILON
    const sameY =
      Math.abs(prev[1] - cur[1]) < EPSILON && Math.abs(cur[1] - next[1]) < EPSILON
    if (!(sameX || sameY)) out.push(cur)
  }
  out.push(d[d.length - 1])
  return out
}

// ── composeManualRoute helpers ────────────────────────────────────────────────

/**
 * Compute the single corner that connects `endpoint` (exiting/entering along
 * `side`'s axis) to `towardBend`. Returns null when endpoint and towardBend
 * are already axis-aligned (share x or y — no corner needed).
 *
 * Horizontal sides (left/right) and undefined → corner at (bend.x, endpoint.y).
 * Vertical sides (top/bottom)               → corner at (endpoint.x, bend.y).
 */
function legCorner(endpoint: Point, side: Side | undefined, towardBend: Point): Point | null {
  if (Math.abs(endpoint[0] - towardBend[0]) < EPSILON) return null // same x, already aligned
  if (Math.abs(endpoint[1] - towardBend[1]) < EPSILON) return null // same y, already aligned
  if (side !== undefined && !isHorizontalSide(side)) {
    // Vertical side: exit/enter along y-axis → corner shares endpoint.x
    return [endpoint[0], towardBend[1]]
  }
  // Horizontal side or undefined: exit/enter along x-axis → corner shares endpoint.y
  return [towardBend[0], endpoint[1]]
}

// ── composeManualRoute ────────────────────────────────────────────────────────

/**
 * Rebuild the full rendered interior route (`waypoints`) for a connector from
 * its user-placed bends + precomputed endpoint sides.
 *
 * Returns INTERIOR points only (excludes `start` and `end`), axis-aligned,
 * deduplicated and collinear-collapsed.
 *
 * - Empty userBends: defers to `autoWaypoints` (both sides required) or `[]`.
 * - Non-empty userBends: inserts one axis-aligned leg corner at each end when
 *   needed, then assembles [start] + startLeg + userBends + endLeg + [end].
 *
 * Pure, O(bends). No shape arguments — sides are precomputed by callers.
 */
export function composeManualRoute(
  start: Point,
  startSide: Side | undefined,
  userBends: Point[],
  end: Point,
  endSide: Side | undefined,
): Point[] {
  if (userBends.length === 0) {
    if (startSide !== undefined && endSide !== undefined) {
      return autoWaypoints(start, startSide, end, endSide)
    }
    return [] // ponytail: free/degenerate connector — no bends
  }

  const firstBend = userBends[0]
  const lastBend = userBends[userBends.length - 1]

  const route: Point[] = [start]

  const startCorner = legCorner(start, startSide, firstBend)
  if (startCorner !== null) route.push(startCorner)

  route.push(...userBends)

  const endCorner = legCorner(end, endSide, lastBend)
  if (endCorner !== null) route.push(endCorner)

  route.push(end)

  return collapseCollinear(route).slice(1, -1)
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

// ── Side-aware anchor + clearance-based side selection ──────────────────────────

/**
 * Midpoint of the given `side` of `shape`, offset outward by GAP. Unlike
 * facingSideAnchor (which derives the side from a target point), the side is
 * explicit — so the caller can pick the side once (e.g. by clearance) and get a
 * matching anchor, avoiding the anchor/side axis divergence that causes kinks.
 */
export function anchorForSide(shape: DiagramElement, side: Side): Point {
  const bbox = computeElementBbox(shape)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  switch (side) {
    case 'right': return [bbox.x + bbox.width + GAP, cy]
    case 'left': return [bbox.x - GAP, cy]
    case 'bottom': return [cx, bbox.y + bbox.height + GAP]
    case 'top': return [cx, bbox.y - GAP]
  }
}

/**
 * Choose which sides two BOUND shapes' connector should exit, by edge-to-edge
 * CLEARANCE rather than center direction alone. Routing on the roomier axis
 * avoids cramming the elbow through a narrow channel between near-touching edges.
 *
 * Conservative: only overrides the center-dominant choice when the other axis is
 * clearly roomier (by > EPSILON). When the axes agree (side-by-side / stacked
 * layouts), the result is identical to the old center rule — so this is additive.
 *
 * Returns the side for the connector's START end (on shape `a`) and END end
 * (on shape `b`).
 */
export function chooseConnectorSides(
  a: DiagramElement,
  b: DiagramElement,
): { startSide: Side; endSide: Side } {
  const ba = computeElementBbox(a)
  const bb = computeElementBbox(b)
  const acx = ba.x + ba.width / 2
  const acy = ba.y + ba.height / 2
  const bcx = bb.x + bb.width / 2
  const bcy = bb.y + bb.height / 2

  // Signed edge gap per axis: positive = a clear channel; negative = overlap.
  const gapX = bb.x >= ba.x + ba.width ? bb.x - (ba.x + ba.width)
    : ba.x >= bb.x + bb.width ? ba.x - (bb.x + bb.width)
    : -1 // projections overlap on X
  const gapY = bb.y >= ba.y + ba.height ? bb.y - (ba.y + ba.height)
    : ba.y >= bb.y + bb.height ? ba.y - (bb.y + bb.height)
    : -1 // projections overlap on Y

  // Center-dominant axis (the legacy choice / tie-break).
  const centerHorizontal = Math.abs(bcx - acx) >= Math.abs(bcy - acy)

  // Override center only when the OTHER axis is clearly roomier.
  let horizontal: boolean
  if (centerHorizontal && gapY - gapX > EPSILON) horizontal = false
  else if (!centerHorizontal && gapX - gapY > EPSILON) horizontal = true
  else horizontal = centerHorizontal

  if (horizontal) {
    return {
      startSide: bcx >= acx ? 'right' : 'left',
      endSide: acx >= bcx ? 'right' : 'left',
    }
  }
  return {
    startSide: bcy >= acy ? 'bottom' : 'top',
    endSide: acy >= bcy ? 'bottom' : 'top',
  }
}
