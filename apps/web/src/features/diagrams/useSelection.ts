import { ref, computed } from 'vue'
import type { DiagramElement } from '@tasknote/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectionBBox {
  x: number
  y: number
  width: number
  height: number
}

interface MoveState {
  id: string
  startScreenX: number
  startScreenY: number
  originalElement: DiagramElement
}

// ── Bbox computation ──────────────────────────────────────────────────────────

const TEXT_APPROX_HEIGHT = 20
const TEXT_APPROX_CHAR_WIDTH = 9

function computeBboxForPoints(points: [number, number][]): SelectionBBox {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function computeElementBbox(el: DiagramElement): SelectionBBox {
  if (el.type === 'rectangle' || el.type === 'ellipse') {
    return { x: el.x, y: el.y, width: el.width, height: el.height }
  }
  if (el.type === 'line' || el.type === 'arrow') {
    return computeBboxForPoints(el.points as [number, number][])
  }
  if (el.type === 'pen') {
    return computeBboxForPoints(el.points as [number, number][])
  }
  // text
  const approxWidth = (el.text?.length ?? 4) * TEXT_APPROX_CHAR_WIDTH
  return { x: el.x, y: el.y - el.fontSize, width: approxWidth, height: TEXT_APPROX_HEIGHT }
}

// ── Move geometry helpers ─────────────────────────────────────────────────────

function translatePoints(
  points: [number, number][],
  dx: number,
  dy: number,
): [number, number][] {
  return points.map(([x, y]) => [x + dx, y + dy])
}

export function buildMovePatch(
  original: DiagramElement,
  dx: number,
  dy: number,
): Partial<DiagramElement> {
  if (original.type === 'rectangle' || original.type === 'ellipse') {
    return { x: original.x + dx, y: original.y + dy } as Partial<DiagramElement>
  }
  if (original.type === 'line' || original.type === 'arrow') {
    const moved = translatePoints(original.points as [number, number][], dx, dy)
    return { points: moved } as Partial<DiagramElement>
  }
  if (original.type === 'pen') {
    const moved = translatePoints(original.points as [number, number][], dx, dy)
    return { points: moved } as Partial<DiagramElement>
  }
  // text
  return { x: original.x + dx, y: original.y + dy } as Partial<DiagramElement>
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSelection() {
  const moveState = ref<MoveState | null>(null)

  function beginMove(
    id: string,
    screenX: number,
    screenY: number,
    original: DiagramElement,
  ): void {
    moveState.value = { id, startScreenX: screenX, startScreenY: screenY, originalElement: original }
  }

  function clearMove(): void {
    moveState.value = null
  }

  const isMoving = computed(() => moveState.value !== null)

  return {
    moveState,
    isMoving,
    beginMove,
    clearMove,
  }
}
