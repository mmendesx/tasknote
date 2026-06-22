import { ref } from 'vue'
import { screenToScene } from '@/stores/diagrams'
import type { DiagramBinding, DiagramViewport } from '@tasknote/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

// Stored verbatim in scene_json. 'currentColor' resolves at RENDER time against
// the canvas's CSS `color` (a design token), so committed strokes stay visible
// in both light and dark themes without baking a theme into persisted data and
// without making these builders impure. Pre-existing rows keep their literal color.
const STROKE_COLOR = 'currentColor'
const STROKE_WIDTH = 2
const FONT_SIZE = 16
const MIN_DRAG_PX = 3

let idCounter = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateId(): string {
  idCounter += 1
  return `el-${idCounter}-${Math.random().toString(36).slice(2, 8)}`
}

export function getScenePoint(
  event: PointerEvent,
  svgEl: SVGElement,
  viewport: DiagramViewport,
): { x: number; y: number } {
  const rect = svgEl.getBoundingClientRect?.() ?? { left: 0, top: 0 }
  const screenPt = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  return screenToScene(screenPt, viewport)
}

export const DRAWING_TOOLS = new Set(['rectangle', 'ellipse', 'line', 'arrow', 'text', 'pen'])

// ── Draw state ────────────────────────────────────────────────────────────────

export type DrawState =
  | { kind: 'idle' }
  | { kind: 'shape'; tool: 'rectangle' | 'ellipse'; ax: number; ay: number }
  | { kind: 'linear'; tool: 'line' | 'arrow'; ax: number; ay: number; startShapeId?: string | null }
  | { kind: 'pen'; points: [number, number][] }
  | { kind: 'text'; x: number; y: number; elId: string; target?: 'text' | 'label' }

export function useDrawState() {
  const drawState = ref<DrawState>({ kind: 'idle' })
  const pendingText = ref('')
  const textInputRef = ref<HTMLInputElement | null>(null)

  // Preview values for rect/ellipse during drag
  const previewShape = ref<{
    type: 'rectangle' | 'ellipse'
    x: number; y: number; width: number; height: number
  } | null>(null)

  // Preview for line/arrow during drag
  const previewLinear = ref<{
    type: 'line' | 'arrow'
    ax: number; ay: number; bx: number; by: number
  } | null>(null)

  // Preview for pen during draw
  const previewPen = ref<[number, number][] | null>(null)

  function cancelDraw() {
    drawState.value = { kind: 'idle' }
    previewShape.value = null
    previewLinear.value = null
    previewPen.value = null
    pendingText.value = ''
  }

  return {
    drawState,
    pendingText,
    textInputRef,
    previewShape,
    previewLinear,
    previewPen,
    cancelDraw,
  }
}

// ── Ramer–Douglas–Peucker simplification ──────────────────────────────────────

export function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points

  const [fx, fy] = points[0]
  const [lx, ly] = points[points.length - 1]
  const dx = lx - fx
  const dy = ly - fy
  const lineLen = Math.hypot(dx, dy)

  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    // Perpendicular distance from point to line between first and last
    const dist = lineLen === 0
      ? Math.hypot(px - fx, py - fy)
      : Math.abs(dy * px - dx * py + lx * fy - ly * fx) / lineLen

    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon)
    const right = rdp(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [points[0], points[points.length - 1]]
}

// ── Style override bag passed into builders ────────────────────────────────────

export interface StyleOverrides {
  stroke?: string
  fill?: string | null
  strokeWidth?: number
  fontSize?: number
  color?: string
}

// ── Per-tool commit builders ───────────────────────────────────────────────────

export function buildRectangleElement(
  ax: number, ay: number, bx: number, by: number,
  style: StyleOverrides = {},
) {
  const x = Math.min(ax, bx)
  const y = Math.min(ay, by)
  const width = Math.abs(bx - ax)
  const height = Math.abs(by - ay)
  if (width < MIN_DRAG_PX || height < MIN_DRAG_PX) return null
  return {
    id: generateId(), type: 'rectangle' as const, x, y, width, height,
    stroke: style.stroke ?? STROKE_COLOR,
    fill: style.fill !== undefined ? style.fill : null,
    strokeWidth: style.strokeWidth ?? STROKE_WIDTH,
  }
}

export function buildEllipseElement(
  ax: number, ay: number, bx: number, by: number,
  style: StyleOverrides = {},
) {
  const x = Math.min(ax, bx)
  const y = Math.min(ay, by)
  const width = Math.abs(bx - ax)
  const height = Math.abs(by - ay)
  if (width < MIN_DRAG_PX || height < MIN_DRAG_PX) return null
  return {
    id: generateId(), type: 'ellipse' as const, x, y, width, height,
    stroke: style.stroke ?? STROKE_COLOR,
    fill: style.fill !== undefined ? style.fill : null,
    strokeWidth: style.strokeWidth ?? STROKE_WIDTH,
  }
}

export function buildLinearElement(
  tool: 'line' | 'arrow',
  ax: number, ay: number, bx: number, by: number,
  startBinding: DiagramBinding | null = null,
  endBinding: DiagramBinding | null = null,
  style: StyleOverrides = {},
  waypoints: [number, number][] = [],
) {
  const isBound = startBinding !== null || endBinding !== null
  const dx = bx - ax, dy = by - ay
  if (!isBound && Math.hypot(dx, dy) < MIN_DRAG_PX) return null
  return {
    id: generateId(),
    type: tool,
    points: [[ax, ay], [bx, by]] as [[number, number], [number, number]],
    stroke: style.stroke ?? STROKE_COLOR,
    strokeWidth: style.strokeWidth ?? STROKE_WIDTH,
    startBinding,
    endBinding,
    waypoints,
    routeMode: 'auto' as const,
  }
}

export function buildTextElement(
  x: number, y: number, text: string,
  style: StyleOverrides = {},
) {
  if (!text.trim()) return null
  return {
    id: generateId(), type: 'text' as const, x, y, text,
    fontSize: style.fontSize ?? FONT_SIZE,
    color: style.color ?? style.stroke ?? STROKE_COLOR,
  }
}

export function buildPenElement(
  points: [number, number][],
  style: StyleOverrides = {},
) {
  const simplified = rdp(points, 1)
  if (simplified.length < 2) return null
  return {
    id: generateId(), type: 'pen' as const, points: simplified,
    stroke: style.stroke ?? STROKE_COLOR,
    strokeWidth: style.strokeWidth ?? STROKE_WIDTH,
  }
}

