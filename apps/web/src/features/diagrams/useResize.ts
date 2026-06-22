import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'
import { findShapeAtScenePoint, findElementById } from './connectors'
import { facingSideAnchor, facingSide, autoWaypoints, chooseConnectorSides, anchorForSide, composeManualRoute } from './orthogonalRoute'
import type { Side } from './orthogonalRoute'

// ── Types ─────────────────────────────────────────────────────────────────────

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type HandleKind = 'shape' | 'endpoint' | 'waypoint'

export interface ResizeState {
  kind: HandleKind
  elementId: string
  handle: HandleId | 0 | 1
  startScreenX: number
  startScreenY: number
  // Snapshot of the element at gesture start
  original: DiagramElement
}

/**
 * State for a waypoint drag gesture (segment-midpoint insertion or existing
 * waypoint move). Stored separately from ResizeState so the existing endpoint
 * and shape resize flow is untouched.
 */
export interface WaypointDragState {
  kind: 'segment' | 'waypoint'
  /** Index into the waypoints array: for 'segment' = insert before this index;
   *  for 'waypoint' = the existing waypoint at this index. */
  waypointIndex: number
  elementId: string
  startScreenX: number
  startScreenY: number
  /** Snapshot of the element at gesture start */
  original: DiagramElement
}

const MIN_SIZE = 8

// Mirrors the connector `waypoints` cap in packages/shared/src/dtos.ts (max 50).
// Kept in sync manually; if the schema cap changes, update this too.
const MAX_WAYPOINTS = 50

// ── Shape resize patch builder ────────────────────────────────────────────────

/**
 * Given the original element, handle being dragged, and delta in scene space,
 * compute the new geometry patch. Clamps to MIN_SIZE (spec-14 FR-B6: clamp,
 * no flip — supersedes spec-13's flip wording; matches Draw.io behaviour).
 *
 * Strategy: work in absolute scene coordinates (left/right/top/bottom edges).
 * Move only the edges that the dragged handle controls, clamp each moved edge
 * so the resulting size never falls below MIN_SIZE, then compute x/y/w/h from
 * the final edges. Because the moving edge is always clamped against its fixed
 * counterpart (fixed ± MIN_SIZE), left ≤ right and top ≤ bottom are invariants
 * — the "flip-safe normalisation" swap that previously followed is unreachable
 * on all handle paths and has been removed.
 */
function buildShapeResizePatch(
  original: DiagramElement,
  handle: HandleId,
  dxScene: number,
  dyScene: number,
): Partial<DiagramElement> {
  if (original.type !== 'rectangle' && original.type !== 'ellipse' && original.type !== 'text') {
    return {}
  }

  const origEl = original as Extract<DiagramElement, { type: 'rectangle' | 'ellipse' }> & { type: string }

  let x: number
  let y: number
  let width: number
  let height: number

  // Text uses x/y directly; rect/ellipse use x/y as top-left
  if (original.type === 'text') {
    const textEl = original as Extract<DiagramElement, { type: 'text' }>
    // For text, approximate a bounding box: we treat the text's x/y as top-left
    // and use a rough width based on fontSize. Only corner handles apply.
    const approxWidth = (textEl.text?.length ?? 4) * textEl.fontSize * 0.6
    const approxHeight = textEl.fontSize * 1.2
    x = textEl.x
    y = textEl.y - approxHeight
    width = approxWidth
    height = approxHeight
  } else {
    x = origEl.x
    y = origEl.y
    width = origEl.width
    height = origEl.height
  }

  // Work in absolute edge coordinates
  const origRight = x + width
  const origBottom = y + height

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se'
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se'

  // Move each edge that this handle controls, then clamp it against its opposing
  // fixed edge so the span never drops below MIN_SIZE. This avoids flip-then-clamp
  // ordering issues: we stop the moving edge at (fixed_edge ± MIN_SIZE) rather
  // than letting it cross and then swapping.

  let left = x
  let right = origRight
  let top = y
  let bottom = origBottom

  if (movesLeft) {
    // Right edge is fixed; left moves rightward → clamp so gap >= MIN_SIZE
    left = Math.min(x + dxScene, origRight - MIN_SIZE)
  }
  if (movesRight) {
    // Left edge is fixed; right moves leftward → clamp so gap >= MIN_SIZE
    right = Math.max(origRight + dxScene, x + MIN_SIZE)
  }
  if (movesTop) {
    // Bottom edge is fixed; top moves downward → clamp so gap >= MIN_SIZE
    top = Math.min(y + dyScene, origBottom - MIN_SIZE)
  }
  if (movesBottom) {
    // Top edge is fixed; bottom moves upward → clamp so gap >= MIN_SIZE
    bottom = Math.max(origBottom + dyScene, y + MIN_SIZE)
  }

  // left ≤ right and top ≤ bottom are guaranteed by the clamp above —
  // no flip-safe swap needed (spec-14 FR-B6).
  const newX = left
  const newW = Math.max(MIN_SIZE, right - left)
  const newY = top
  const newH = Math.max(MIN_SIZE, bottom - top)

  if (original.type === 'text') {
    const textEl = original as Extract<DiagramElement, { type: 'text' }>
    // Scale fontSize proportionally based on width ratio
    const oldW = width
    const ratio = oldW > 0 ? newW / oldW : 1
    const newFontSize = Math.max(4, Math.round(textEl.fontSize * ratio))
    return {
      x: newX,
      y: newY + newH, // restore y to baseline
      fontSize: newFontSize,
    } as Partial<DiagramElement>
  }

  return {
    x: newX,
    y: newY,
    width: newW,
    height: newH,
  } as Partial<DiagramElement>
}

// ── Endpoint resize patch builder ─────────────────────────────────────────────

/**
 * For line/arrow endpoint handles (0 = start, 1 = end).
 * Returns the new points array with the moved endpoint.
 */
function buildEndpointPatch(
  original: DiagramElement,
  handle: 0 | 1,
  dxScene: number,
  dyScene: number,
): Partial<DiagramElement> {
  if (original.type !== 'line' && original.type !== 'arrow') return {}

  const pts = original.points as [[number, number], [number, number]]
  const newPts: [[number, number], [number, number]] = [
    [pts[0][0], pts[0][1]],
    [pts[1][0], pts[1][1]],
  ]
  newPts[handle] = [pts[handle][0] + dxScene, pts[handle][1] + dyScene]
  return { points: newPts } as Partial<DiagramElement>
}

// ── Waypoint patch builder ────────────────────────────────────────────────────

/** Remove consecutive duplicate points. */
function dedupRoute(pts: [number, number][]): [number, number][] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1])
}

/**
 * Determine whether segment A→B is horizontal or vertical.
 * Uses dominant axis to handle legacy diagonal segments gracefully.
 */
function segmentIsHorizontal(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[1] - b[1]) <= Math.abs(a[0] - b[0])
}

/**
 * Build the two axis-aligned corner points that replace a slid segment A→B.
 * Horizontal segment: shift by dyScene only → corners at (A.x, newY) and (B.x, newY).
 * Vertical segment:   shift by dxScene only → corners at (newX, A.y) and (newX, B.y).
 */
function buildSlideCorners(
  a: [number, number],
  b: [number, number],
  dxScene: number,
  dyScene: number,
): [[number, number], [number, number]] {
  if (segmentIsHorizontal(a, b)) {
    const newY = a[1] + dyScene
    return [[a[0], newY], [b[0], newY]]
  }
  const newX = a[0] + dxScene
  return [[newX, a[1]], [newX, b[1]]]
}

/**
 * Build an axis-aligned two-segment leg from `from` to `to`, where the first
 * segment leaves `from` along the axis determined by `fromSegWasHorizontal`.
 * Returns the single interior bend point (may coincide with `to` if already aligned).
 *
 * fromSegWasHorizontal=true  → first leave horizontally: bend at (to.x, from.y)
 * fromSegWasHorizontal=false → first leave vertically:   bend at (from.x, to.y)
 */
function orthogonalCornerLeg(
  from: [number, number],
  to: [number, number],
  fromSegWasHorizontal: boolean,
): [number, number] {
  if (fromSegWasHorizontal) {
    return [to[0], from[1]]
  }
  return [from[0], to[1]]
}

/**
 * Compute the new waypoints array for a waypoint drag gesture.
 *
 * For 'segment': slides the segment at index s perpendicular to its orientation,
 * inserting two axis-aligned corner points so all route segments stay orthogonal.
 * Horizontal segment dragged by dy → corners at (A.x, A.y+dy) and (B.x, A.y+dy).
 * Vertical segment dragged by dx → corners at (A.x+dx, A.y) and (A.x+dx, B.y).
 *
 * For 'waypoint': moves the corner freely by (dxScene, dyScene), then rebuilds
 * the two adjacent legs as orthogonal two-segment paths (prev→Cnew, Cnew→next),
 * preserving the original orientation of each leg's first segment. This guarantees
 * every consecutive pair in the full route shares x or y (FR-3).
 */
/**
 * Derive the leg-orientation side for each end of a connector at interior-drag
 * time. Sides are used ONLY to orient the start/end leg corner in
 * composeManualRoute — endpoints (`pts`) are NOT re-anchored here, so a bound
 * shape that hasn't moved keeps its current anchor and never jumps mid-drag.
 *
 * Bound end → the side facing the adjacent interior point (or the other endpoint
 * when there are no bends). Free end → undefined (legCorner falls back to a
 * horizontal leg).
 */
function deriveDragSides(
  original: DiagramElement,
  pts: [[number, number], [number, number]],
  interior: [number, number][],
  els: DiagramElement[],
): { startSide: Side | undefined; endSide: Side | undefined } {
  const startId = (original as any).startBinding?.elementId as string | undefined
  const endId = (original as any).endBinding?.elementId as string | undefined
  const startShape = startId ? findElementById(els, startId) : undefined
  const endShape = endId ? findElementById(els, endId) : undefined

  const towardStart = interior[0] ?? pts[1]
  const towardEnd = interior[interior.length - 1] ?? pts[0]

  return {
    startSide: startShape ? facingSide(startShape, towardStart) : undefined,
    endSide: endShape ? facingSide(endShape, towardEnd) : undefined,
  }
}

function buildWaypointPatch(
  original: DiagramElement,
  kind: 'segment' | 'waypoint',
  waypointIndex: number,
  dxScene: number,
  dyScene: number,
  els: DiagramElement[],
): Partial<DiagramElement> {
  if (original.type !== 'line' && original.type !== 'arrow') return {}

  const pts = (original as any).points as [[number, number], [number, number]]
  const existingWaypoints: [number, number][] = (original as any).waypoints ?? []

  // Full route: [start, ...waypoints, end]
  const route: [number, number][] = [pts[0], ...existingWaypoints, pts[1]]

  let newWaypoints: [number, number][]

  if (kind === 'segment') {
    // Cap userBends at the schema limit (50) so a save can't be rejected
    // server-side. A segment slide inserts 2 corners, so block at 48.
    if (existingWaypoints.length > MAX_WAYPOINTS - 2) {
      return { userBends: existingWaypoints, waypoints: existingWaypoints, routeMode: 'manual' } as Partial<DiagramElement>
    }
    // Segment s connects route[s] → route[s+1].
    // Replace it with two corners so the route stays fully axis-aligned.
    const s = waypointIndex
    const A = route[s]!
    const B = route[s + 1]!
    const [c1, c2] = buildSlideCorners(A, B, dxScene, dyScene)
    // Insert the two corners into the waypoints array between indices s and s+1.
    // The endpoints pts[0]/pts[1] are never part of existingWaypoints, so they
    // cannot move — only interior route points change.
    const rawWaypoints: [number, number][] = [
      ...existingWaypoints.slice(0, s),
      c1,
      c2,
      ...existingWaypoints.slice(s),
    ]
    // Rebuild full route to dedup zero-length legs (e.g. when A or B is an endpoint)
    const fullRoute = dedupRoute([pts[0], ...rawWaypoints, pts[1]])
    newWaypoints = fullRoute.slice(1, -1) as [number, number][]
  } else {
    // Move the corner freely; rebuild both adjacent legs to stay axis-aligned.
    // The corner at route index (waypointIndex+1) sits between:
    //   prev: route[waypointIndex] → corner
    //   next: corner → route[waypointIndex+2]
    const ci = waypointIndex + 1
    const prev = route[ci - 1]!
    const corner = route[ci]!
    const next = route[ci + 1]!
    const Cnew: [number, number] = [corner[0] + dxScene, corner[1] + dyScene]
    const prevWasH = segmentIsHorizontal(prev, corner)
    const nextWasH = segmentIsHorizontal(corner, next)
    const bend1 = orthogonalCornerLeg(prev, Cnew, prevWasH)
    const bend2 = orthogonalCornerLeg(Cnew, next, !nextWasH)
    // Interior points replacing the single old corner between prev and next
    const interior: [number, number][] = [bend1, Cnew, bend2]
    const rawWaypoints: [number, number][] = [
      ...existingWaypoints.slice(0, waypointIndex),
      ...interior,
      ...existingWaypoints.slice(waypointIndex + 1),
    ]
    const fullRouteArr = dedupRoute([pts[0], ...rawWaypoints, pts[1]])
    newWaypoints = fullRouteArr.slice(1, -1) as [number, number][]
  }

  // The orthogonal interior just computed IS the user's bend chain (ICT-4):
  // store it verbatim in userBends, then derive the rendered route from it via
  // the same composer used on shape move (ICT-3) — same inputs, same output, so
  // the first move after a drag doesn't make the route jump.
  const userBends = newWaypoints
  const { startSide, endSide } = deriveDragSides(original, pts, userBends, els)
  const waypoints = composeManualRoute(pts[0], startSide, userBends, pts[1], endSide)
  return { userBends, waypoints, routeMode: 'manual' } as Partial<DiagramElement>
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useResize(
  getElements: () => DiagramElement[],
  getViewport: () => DiagramViewport,
): {
  resizeState: Ref<ResizeState | null>
  waypointDragState: Ref<WaypointDragState | null>
  beginResize(elementId: string, handle: HandleId | 0 | 1, screenX: number, screenY: number): void
  beginWaypointDrag(elementId: string, kind: 'segment' | 'waypoint', waypointIndex: number, screenX: number, screenY: number): void
  updateResize(screenX: number, screenY: number): Partial<DiagramElement> | null
  commitResize(screenX: number, screenY: number): { patch: Partial<DiagramElement>; newBindings?: { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null } } | null
  cancelResize(): void
  isResizing: ComputedRef<boolean>
} {
  const resizeState = ref<ResizeState | null>(null)
  const waypointDragState = ref<WaypointDragState | null>(null)

  const isResizing = computed(() => resizeState.value !== null || waypointDragState.value !== null)

  function beginResize(
    elementId: string,
    handle: HandleId | 0 | 1,
    screenX: number,
    screenY: number,
  ): void {
    const el = findElementById(getElements(), elementId)
    if (!el) return

    const kind: HandleKind = typeof handle === 'number' ? 'endpoint' : 'shape'

    resizeState.value = {
      kind,
      elementId,
      handle,
      startScreenX: screenX,
      startScreenY: screenY,
      original: { ...el } as DiagramElement,
    }
  }

  function beginWaypointDrag(
    elementId: string,
    kind: 'segment' | 'waypoint',
    waypointIndex: number,
    screenX: number,
    screenY: number,
  ): void {
    const el = findElementById(getElements(), elementId)
    if (!el) return

    waypointDragState.value = {
      kind,
      waypointIndex,
      elementId,
      startScreenX: screenX,
      startScreenY: screenY,
      original: { ...el } as DiagramElement,
    }
  }

  function updateResize(screenX: number, screenY: number): Partial<DiagramElement> | null {
    // Check waypoint drag first
    const wpState = waypointDragState.value
    if (wpState) {
      const viewport = getViewport()
      const dxScene = (screenX - wpState.startScreenX) / viewport.zoom
      const dyScene = (screenY - wpState.startScreenY) / viewport.zoom
      return buildWaypointPatch(wpState.original, wpState.kind, wpState.waypointIndex, dxScene, dyScene, getElements())
    }

    const state = resizeState.value
    if (!state) return null

    const viewport = getViewport()
    const dxScene = (screenX - state.startScreenX) / viewport.zoom
    const dyScene = (screenY - state.startScreenY) / viewport.zoom

    if (state.kind === 'endpoint') {
      return buildEndpointPatch(state.original, state.handle as 0 | 1, dxScene, dyScene)
    }
    return buildShapeResizePatch(state.original, state.handle as HandleId, dxScene, dyScene)
  }

  function commitResize(
    screenX: number,
    screenY: number,
  ): {
    patch: Partial<DiagramElement>
    newBindings?: { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null }
  } | null {
    // Handle waypoint drag commit
    const wpState = waypointDragState.value
    if (wpState) {
      const patch = updateResize(screenX, screenY)
      waypointDragState.value = null
      if (!patch) return null
      return { patch }
    }

    const state = resizeState.value
    if (!state) return null

    const patch = updateResize(screenX, screenY)
    if (!patch) {
      resizeState.value = null
      return null
    }

    let newBindings:
      | { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null }
      | undefined

    if (state.kind === 'endpoint') {
      const patchPts = (patch as any).points as [[number, number], [number, number]] | undefined
      if (patchPts) {
        const handle = state.handle as 0 | 1
        const [endX, endY] = patchPts[handle]

        const shapeId = findShapeAtScenePoint({ x: endX, y: endY }, getElements())

        const original = state.original as Extract<DiagramElement, { type: 'line' | 'arrow' }>
        let startBinding = original.startBinding ?? null
        let endBinding = original.endBinding ?? null

        // A connector carrying user bends is manual: repositioning an endpoint
        // keeps userBends and recomposes the route (ICT-5). Empty userBends →
        // the original revert-to-auto path (clears stale waypoints, no stray
        // diagonal seams — the spec-21 "various lines" fix).
        const userBends: [number, number][] = (original as any).userBends ?? []
        const isManual = userBends.length > 0
        // Manual leg orientation aims at the route's nearest bend, not the far
        // endpoint: handle 0 exits toward userBends[0], handle 1 toward the last.
        const nearestBend = handle === 0 ? userBends[0] : userBends[userBends.length - 1]

        // Per-end geometry, resolved by each case below; the shared block after
        // composes auto or manual waypoints from these.
        let start = patchPts[0] as [number, number]
        let end = patchPts[1] as [number, number]
        let startSide: Side | undefined
        let endSide: Side | undefined

        if (handle === 0) {
          startBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const endShape = endBinding?.elementId ? findElementById(getElements(), endBinding.elementId) : undefined
              if (endShape) {
                // Both ends bound — choose sides by clearance for a clean route.
                const sides = chooseConnectorSides(shape, endShape)
                startSide = sides.startSide
                endSide = sides.endSide
                start = anchorForSide(shape, startSide)
                end = anchorForSide(endShape, endSide)
              } else {
                // Other end free: anchor the bound start toward the nearest bend
                // (manual) or the far endpoint (auto).
                const toward = isManual ? (nearestBend ?? end) : end
                start = facingSideAnchor(shape, toward)
                startSide = facingSide(shape, toward)
                end = patchPts[1]
                // endSide stays undefined — free end.
              }
            }
          }
          // else dragged onto empty space — start stays free (startSide undefined).
        } else {
          endBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const startShape = startBinding?.elementId ? findElementById(getElements(), startBinding.elementId) : undefined
              if (startShape) {
                // Both ends bound — choose sides by clearance for a clean route.
                const sides = chooseConnectorSides(startShape, shape)
                startSide = sides.startSide
                endSide = sides.endSide
                start = anchorForSide(startShape, startSide)
                end = anchorForSide(shape, endSide)
              } else {
                // Other end free: anchor the bound end toward the nearest bend
                // (manual) or the far endpoint (auto).
                const toward = isManual ? (nearestBend ?? start) : start
                end = facingSideAnchor(shape, toward)
                endSide = facingSide(shape, toward)
                start = patchPts[0]
                // startSide stays undefined — free end.
              }
            }
          }
          // else dragged onto empty space — end stays free (endSide undefined).
        }

        ;(patch as any).points = [start, end]
        if (isManual) {
          // Keep userBends verbatim, recompose the legs against the new anchors.
          ;(patch as any).waypoints = composeManualRoute(start, startSide, userBends, end, endSide)
          ;(patch as any).routeMode = 'manual'
        } else {
          ;(patch as any).waypoints =
            startSide && endSide ? autoWaypoints(start, startSide, end, endSide) : []
          ;(patch as any).routeMode = 'auto'
        }

        newBindings = { startBinding, endBinding }
      }
    }

    resizeState.value = null
    return { patch, newBindings }
  }

  function cancelResize(): void {
    resizeState.value = null
    waypointDragState.value = null
  }

  return {
    resizeState,
    waypointDragState,
    beginResize,
    beginWaypointDrag,
    updateResize,
    commitResize,
    cancelResize,
    isResizing,
  }
}
