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
