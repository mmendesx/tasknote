import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'
import { findShapeAtScenePoint, findElementById, boundEndpoint, elementCenter } from './connectors'

// ── Types ─────────────────────────────────────────────────────────────────────

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type HandleKind = 'shape' | 'endpoint'

export interface ResizeState {
  kind: HandleKind
  elementId: string
  handle: HandleId | 0 | 1
  startScreenX: number
  startScreenY: number
  // Snapshot of the element at gesture start
  original: DiagramElement
}

const MIN_SIZE = 8

// ── Shape resize patch builder ────────────────────────────────────────────────

/**
 * Given the original element, handle being dragged, and delta in scene space,
 * compute the new geometry patch. Clamps to MIN_SIZE and handles flip-safe
 * behavior when dragging past the opposite edge.
 *
 * Strategy: work in absolute scene coordinates (left/right/top/bottom edges).
 * Move only the edges that the dragged handle controls, clamp each moved edge
 * so the resulting size never falls below MIN_SIZE, then compute x/y/w/h from
 * the final edges. This avoids the flip-then-clamp ordering bug where the
 * "flipped" distance (e.g. 40px overshot) was larger than MIN_SIZE and escaped
 * the clamp.
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

  // Flip-safe normalisation: if the moving edge crossed the fixed edge (which
  // can happen on the non-clamped axis when only one axis is involved, e.g.
  // dragging `n` so far down that top > bottom), swap so width/height stay +ve.
  let newX: number
  let newW: number
  let newY: number
  let newH: number

  if (left <= right) {
    newX = left
    newW = right - left
  } else {
    newX = right
    newW = left - right
  }
  if (top <= bottom) {
    newY = top
    newH = bottom - top
  } else {
    newY = bottom
    newH = top - bottom
  }

  // Final safety clamp (should already be satisfied by the edge clamping above)
  newW = Math.max(MIN_SIZE, newW)
  newH = Math.max(MIN_SIZE, newH)

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

// ── Composable ────────────────────────────────────────────────────────────────

export function useResize(
  getElements: () => DiagramElement[],
  getViewport: () => DiagramViewport,
): {
  resizeState: Ref<ResizeState | null>
  beginResize(elementId: string, handle: HandleId | 0 | 1, screenX: number, screenY: number): void
  updateResize(screenX: number, screenY: number): Partial<DiagramElement> | null
  commitResize(screenX: number, screenY: number): { patch: Partial<DiagramElement>; newBindings?: { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null } } | null
  cancelResize(): void
  isResizing: ComputedRef<boolean>
} {
  const resizeState = ref<ResizeState | null>(null)

  const isResizing = computed(() => resizeState.value !== null)

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

  function updateResize(screenX: number, screenY: number): Partial<DiagramElement> | null {
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

        if (handle === 0) {
          startBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const otherPt = { x: patchPts[1][0], y: patchPts[1][1] }
              const anchored = boundEndpoint(shape, otherPt)
              const newPts: [[number, number], [number, number]] = [
                [anchored.x, anchored.y],
                patchPts[1],
              ]
              ;(patch as any).points = newPts
            }
          }
        } else {
          endBinding = shapeId ? { elementId: shapeId } : null
          if (shapeId) {
            const shape = findElementById(getElements(), shapeId)
            if (shape) {
              const otherPt = { x: patchPts[0][0], y: patchPts[0][1] }
              const anchored = boundEndpoint(shape, otherPt)
              const newPts: [[number, number], [number, number]] = [
                patchPts[0],
                [anchored.x, anchored.y],
              ]
              ;(patch as any).points = newPts
            }
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
  }

  return {
    resizeState,
    beginResize,
    updateResize,
    commitResize,
    cancelResize,
    isResizing,
  }
}
