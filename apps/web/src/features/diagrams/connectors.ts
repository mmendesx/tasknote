import type { DiagramElement } from '@tasknote/shared'
import { computeElementBbox } from './useSelection'

// ── Center helper ─────────────────────────────────────────────────────────────

export function elementCenter(el: DiagramElement): { x: number; y: number } {
  const bbox = computeElementBbox(el)
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
}

// ── Bindable shape guard ──────────────────────────────────────────────────────

export function isBindableShape(el: DiagramElement): boolean {
  return el.type === 'rectangle' || el.type === 'ellipse'
}

// ── Element lookup ────────────────────────────────────────────────────────────

export function findElementById(elements: DiagramElement[], id: string): DiagramElement | undefined {
  return elements.find((el) => el.id === id)
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
