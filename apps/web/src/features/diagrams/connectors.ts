import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox } from './useSelection'
import { rectEdgePoint, ellipseEdgePoint } from './connectorGeometry'

// ── Center helper ─────────────────────────────────────────────────────────────

export function elementCenter(el: DiagramElement): { x: number; y: number } {
  const bbox = computeElementBbox(el)
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
}

// ── Edge-anchored endpoint ────────────────────────────────────────────────────

/**
 * Returns the point on the boundary of `shape` where a connector arriving from
 * `from` should anchor. Dispatches to the appropriate geometry function based
 * on shape type. Only rectangles and ellipses are bindable (isBindableShape
 * guards call sites), so no default branch is needed beyond those two.
 */
export function boundEndpoint(
  shape: DiagramElement,
  from: { x: number; y: number },
): { x: number; y: number } {
  const bbox = computeElementBbox(shape)
  if (shape.type === 'rectangle') {
    return rectEdgePoint(bbox, from)
  }
  // ellipse
  return ellipseEdgePoint(bbox, from)
}

// ── Bindable shape guard ──────────────────────────────────────────────────────

export function isBindableShape(el: DiagramElement): boolean {
  return el.type === 'rectangle' || el.type === 'ellipse'
}

// ── Element lookup ────────────────────────────────────────────────────────────

export function findElementById(elements: DiagramElement[], id: string): DiagramElement | undefined {
  return elements.find((el) => el.id === id)
}

// ── Binding detach on shape deletion ─────────────────────────────────────────

/** Clear startBinding/endBinding referencing `removedId` from every arrow/line.
 *  Points are left exactly as-is; unaffected elements keep their reference. */
export function detachBindingsTo(
  elements: DiagramElement[],
  removedId: string,
): DiagramElement[] {
  return elements.map((el) => {
    if (el.type !== 'arrow' && el.type !== 'line') return el

    const matchesStart = el.startBinding?.elementId === removedId
    const matchesEnd = el.endBinding?.elementId === removedId
    if (!matchesStart && !matchesEnd) return el

    return {
      ...el,
      startBinding: matchesStart ? null : el.startBinding,
      endBinding: matchesEnd ? null : el.endBinding,
    }
  })
}

// ── Pure geometric hit-test ───────────────────────────────────────────────────

/**
 * Returns the id of the topmost bindable shape (rectangle or ellipse) that
 * contains `point` in scene coordinates, or null if none does.
 *
 * "Topmost" means last in the `elements` array, which is how the renderer
 * stacks shapes (later = on top). Iterates in reverse so the first match is
 * the visually frontmost shape.
 *
 * No DOM access — safe to call in tests and worker contexts.
 */
export function findShapeAtScenePoint(
  point: { x: number; y: number },
  elements: DiagramElement[],
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (!isBindableShape(el)) continue

    const bbox = computeElementBbox(el)

    if (el.type === 'rectangle') {
      if (
        point.x >= bbox.x &&
        point.x <= bbox.x + bbox.width &&
        point.y >= bbox.y &&
        point.y <= bbox.y + bbox.height
      ) {
        return el.id
      }
    } else if (el.type === 'ellipse') {
      const rx = bbox.width / 2
      const ry = bbox.height / 2
      if (rx === 0 || ry === 0) continue
      const cx = bbox.x + rx
      const cy = bbox.y + ry
      const nx = (point.x - cx) / rx
      const ny = (point.y - cy) / ry
      if (nx * nx + ny * ny <= 1) {
        return el.id
      }
    }
  }
  return null
}

// ── Re-anchor connectors after shape move ─────────────────────────────────────

/**
 * Pure helper that re-anchors every connector whose bindings reference shapes
 * that have moved.
 *
 * Contract: pass an `elements` view whose moved shapes already reflect their
 * new positions. Endpoints anchor to those positions — this helper applies no
 * delta of its own.
 *
 * Returns one patch per affected connector (those whose startBinding or
 * endBinding elementId is in `movedShapeIds`). Connectors not touching the
 * moved set are absent from the output.
 *
 * Dangling bindings (shape not found in elements) are treated as unbound for
 * the recompute: the dangling end keeps its current raw point.
 */
export function reanchorConnectorsForMovedShapes(
  elements: DiagramElement[],
  movedShapeIds: Set<string>,
): Array<{ id: string; patch: { points: [[number, number], [number, number]] } }> {
  const patches: Array<{ id: string; patch: { points: [[number, number], [number, number]] } }> = []

  for (const el of elements) {
    if (el.type !== 'arrow' && el.type !== 'line') continue

    const startId = el.startBinding?.elementId ?? null
    const endId = el.endBinding?.elementId ?? null

    const touchesMoved =
      (startId !== null && movedShapeIds.has(startId)) ||
      (endId !== null && movedShapeIds.has(endId))

    if (!touchesMoved) continue

    const startShape = startId ? findElementById(elements, startId) : undefined
    const endShape = endId ? findElementById(elements, endId) : undefined

    const rawStart: { x: number; y: number } = { x: el.points[0][0], y: el.points[0][1] }
    const rawEnd: { x: number; y: number } = { x: el.points[1][0], y: el.points[1][1] }

    const newStart = recomputeEndpoint(startShape, rawStart, endShape, rawEnd)
    const newEnd = recomputeEndpoint(endShape, rawEnd, startShape, rawStart)

    const points: [[number, number], [number, number]] = [
      [newStart.x, newStart.y],
      [newEnd.x, newEnd.y],
    ]

    patches.push({ id: el.id, patch: { points } })
  }

  return patches
}

function recomputeEndpoint(
  thisShape: DiagramElement | undefined,
  thisPoint: { x: number; y: number },
  otherShape: DiagramElement | undefined,
  otherPoint: { x: number; y: number },
): { x: number; y: number } {
  if (!thisShape) return thisPoint
  const from = otherShape ? elementCenter(otherShape) : otherPoint
  return boundEndpoint(thisShape, from)
}

// ── Capture-safe point resolver ───────────────────────────────────────────────

export function resolveShapeIdAtPoint(
  clientX: number,
  clientY: number,
  elements: DiagramElement[],
): string | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null
  }

  const node = document.elementFromPoint(clientX, clientY)
  if (!node) return null

  const closest = node.closest('[data-element-id]')
  if (!closest) return null

  const id = closest.getAttribute('data-element-id')
  if (!id) return null

  const el = findElementById(elements, id)
  if (!el) return null

  return isBindableShape(el) ? id : null
}
