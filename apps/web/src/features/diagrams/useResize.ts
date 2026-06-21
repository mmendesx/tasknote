import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'
import { findShapeAtScenePoint, findElementById } from './connectors'
import { facingSideAnchor, facingSide, autoWaypoints, fixManualLeg } from './orthogonalRoute'

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

/**
 * Compute the new waypoints array for a waypoint drag gesture.
 *
 * For 'segment': inserts a new point at `waypointIndex` in the original
 * waypoints array and moves it by (dxScene, dyScene) from its initial
 * segment-midpoint position.
 *
 * For 'waypoint': moves the existing waypoint at `waypointIndex` by the delta.
 *
 * ponytail: stored waypoints are literal scene positions; segments into/out of
 * a manual waypoint may be diagonal. The spec requires routeMode→'manual' and
 * the point to follow the pointer — axis-alignment is a future enhancement.
 */
function buildWaypointPatch(
  original: DiagramElement,
  kind: 'segment' | 'waypoint',
  waypointIndex: number,
  dxScene: number,
  dyScene: number,
): Partial<DiagramElement> {
  if (original.type !== 'line' && original.type !== 'arrow') return {}

  const pts = (original as any).points as [[number, number], [number, number]]
  const existingWaypoints: [number, number][] = (original as any).waypoints ?? []

  // Build the full route: [start, ...waypoints, end]
  const route: [number, number][] = [pts[0], ...existingWaypoints, pts[1]]

  let newWaypoints: [number, number][]

  if (kind === 'segment') {
    // Segment s connects route[s] → route[s+1]. The midpoint was the initial position.
    const s = waypointIndex
    const mx = (route[s]![0] + route[s + 1]![0]) / 2
    const my = (route[s]![1] + route[s + 1]![1]) / 2
    const newPoint: [number, number] = [mx + dxScene, my + dyScene]
    // Insert at index s in the waypoints array (between route[s] and route[s+1])
    newWaypoints = [
      ...existingWaypoints.slice(0, s),
      newPoint,
      ...existingWaypoints.slice(s),
    ]
  } else {
    // Move existing waypoint at waypointIndex
    const wp = existingWaypoints[waypointIndex]!
    const moved: [number, number] = [wp[0] + dxScene, wp[1] + dyScene]
    newWaypoints = existingWaypoints.map((p, i) => (i === waypointIndex ? moved : p))
  }

  return { waypoints: newWaypoints, routeMode: 'manual' } as Partial<DiagramElement>
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
      return buildWaypointPatch(wpState.original, wpState.kind, wpState.waypointIndex, dxScene, dyScene)
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
        const isManual = (original as any).routeMode === 'manual'
        const existingWaypoints: [number, number][] = (original as any).waypoints ?? []

        if (handle === 0) {
          startBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const toward: [number, number] = [patchPts[1][0], patchPts[1][1]]
              const anchored = facingSideAnchor(shape, toward)
              const newPts: [[number, number], [number, number]] = [anchored, patchPts[1]]
              ;(patch as any).points = newPts
              const startSide = facingSide(shape, toward)
              const endShape = endBinding?.elementId ? findElementById(getElements(), endBinding.elementId) : undefined
              if (isManual) {
                const fixed = fixManualLeg(anchored, startSide, existingWaypoints, 'start')
                ;(patch as any).waypoints = fixed ?? autoWaypoints(anchored, startSide, patchPts[1], endShape ? facingSide(endShape, [anchored[0], anchored[1]]) : startSide)
              } else {
                const endSide = endShape ? facingSide(endShape, [anchored[0], anchored[1]]) : undefined
                ;(patch as any).waypoints = endSide ? autoWaypoints(anchored, startSide, patchPts[1], endSide) : []
              }
            }
          } else {
            // End re-anchored to nothing — clear waypoints for auto connectors.
            if (!isManual) { (patch as any).waypoints = [] }
          }
        } else {
          endBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const toward: [number, number] = [patchPts[0][0], patchPts[0][1]]
              const anchored = facingSideAnchor(shape, toward)
              const newPts: [[number, number], [number, number]] = [patchPts[0], anchored]
              ;(patch as any).points = newPts
              const endSide = facingSide(shape, toward)
              const startShape = startBinding?.elementId ? findElementById(getElements(), startBinding.elementId) : undefined
              if (isManual) {
                const fixed = fixManualLeg(anchored, endSide, existingWaypoints, 'end')
                ;(patch as any).waypoints = fixed ?? autoWaypoints(patchPts[0], startShape ? facingSide(startShape, [anchored[0], anchored[1]]) : endSide, anchored, endSide)
              } else {
                const startSide = startShape ? facingSide(startShape, [anchored[0], anchored[1]]) : undefined
                ;(patch as any).waypoints = startSide ? autoWaypoints(patchPts[0], startSide, anchored, endSide) : []
              }
            }
          } else {
            // End re-anchored to nothing — clear waypoints for auto connectors.
            if (!isManual) { (patch as any).waypoints = [] }
          }
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
