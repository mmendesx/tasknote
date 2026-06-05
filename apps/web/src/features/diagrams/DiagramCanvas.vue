<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'
import { useDiagramsStore, screenToScene } from '@/stores/diagrams'
import {
  DRAWING_TOOLS,
  useDrawState,
  getScenePoint,
  buildRectangleElement,
  buildEllipseElement,
  buildLinearElement,
  buildTextElement,
  buildPenElement,
} from './useDrawTools'

// ── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{ diagramId: number }>()

// ── Store ────────────────────────────────────────────────────────────────────

const store = useDiagramsStore()

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

// ── Derived ──────────────────────────────────────────────────────────────────

const elements = computed(() => store.elements)

const viewportTransform = computed(() => {
  const { scrollX, scrollY, zoom } = store.viewport
  // scene→screen: screen = (scene + scroll) * zoom
  // SVG translate(tx,ty) scale(s) maps point p → s*p + (tx,ty)
  // So tx = scrollX*zoom, ty = scrollY*zoom, s = zoom
  return `translate(${scrollX * zoom},${scrollY * zoom}) scale(${zoom})`
})

// ── Load ─────────────────────────────────────────────────────────────────────

async function loadCurrentDiagram() {
  await store.loadDiagram(props.diagramId)
}

onMounted(loadCurrentDiagram)

watch(() => props.diagramId, loadCurrentDiagram)

// ── Pan ───────────────────────────────────────────────────────────────────────

const isPanning = ref(false)
const panOrigin = ref({ x: 0, y: 0 })
const panViewportStart = ref<DiagramViewport>({ scrollX: 0, scrollY: 0, zoom: 1 })

const svgEl = ref<SVGSVGElement | null>(null)

function isPanTool(): boolean {
  return store.tool === 'hand'
}

function isDrawingTool(): boolean {
  return DRAWING_TOOLS.has(store.tool)
}

// ── Draw state ────────────────────────────────────────────────────────────────

const {
  drawState,
  pendingText,
  textInputRef,
  previewShape,
  previewLinear,
  previewPen,
  cancelDraw,
} = useDrawState()

// ── Escape handler ────────────────────────────────────────────────────────────

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  cancelDraw()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// ── Pointer helpers ───────────────────────────────────────────────────────────

function getScenePt(event: PointerEvent): { x: number; y: number } {
  const el = svgEl.value as SVGElement | null
  if (!el) return screenToScene({ x: event.clientX, y: event.clientY }, store.viewport)
  return getScenePoint(event, el, store.viewport)
}

// ── Pointer handlers ──────────────────────────────────────────────────────────

// Seam for ICT-6/7: this function handles canvas-level pointer interactions.
function onCanvasPointerDown(event: PointerEvent): void {
  if (isPanTool()) {
    isPanning.value = true
    panOrigin.value = { x: event.clientX, y: event.clientY }
    panViewportStart.value = { ...store.viewport }
    const target = event.currentTarget as SVGElement
    if (target?.setPointerCapture) {
      target.setPointerCapture(event.pointerId)
    }
    return
  }

  if (isDrawingTool()) {
    const pt = getScenePt(event)
    const tool = store.tool

    if (tool === 'rectangle' || tool === 'ellipse') {
      drawState.value = { kind: 'shape', tool, ax: pt.x, ay: pt.y }
      previewShape.value = { type: tool, x: pt.x, y: pt.y, width: 0, height: 0 }
    } else if (tool === 'line' || tool === 'arrow') {
      drawState.value = { kind: 'linear', tool, ax: pt.x, ay: pt.y }
      previewLinear.value = { type: tool, ax: pt.x, ay: pt.y, bx: pt.x, by: pt.y }
    } else if (tool === 'text') {
      drawState.value = { kind: 'text', x: pt.x, y: pt.y, elId: '' }
      pendingText.value = ''
      nextTick(() => textInputRef.value?.focus())
    } else if (tool === 'pen') {
      drawState.value = { kind: 'pen', points: [[pt.x, pt.y]] }
      previewPen.value = [[pt.x, pt.y]]
    }

    const target = event.currentTarget as SVGElement
    if (target?.setPointerCapture) {
      target.setPointerCapture(event.pointerId)
    }
    return
  }
}

function onCanvasPointerMove(event: PointerEvent): void {
  if (isPanning.value) {
    const dx = event.clientX - panOrigin.value.x
    const dy = event.clientY - panOrigin.value.y
    const zoom = panViewportStart.value.zoom
    store.setViewport({
      scrollX: panViewportStart.value.scrollX + dx / zoom,
      scrollY: panViewportStart.value.scrollY + dy / zoom,
      zoom,
    })
    return
  }

  const state = drawState.value
  if (state.kind === 'shape') {
    const pt = getScenePt(event)
    previewShape.value = {
      type: state.tool,
      x: Math.min(state.ax, pt.x),
      y: Math.min(state.ay, pt.y),
      width: Math.abs(pt.x - state.ax),
      height: Math.abs(pt.y - state.ay),
    }
  } else if (state.kind === 'linear') {
    const pt = getScenePt(event)
    previewLinear.value = { type: state.tool, ax: state.ax, ay: state.ay, bx: pt.x, by: pt.y }
  } else if (state.kind === 'pen') {
    const pt = getScenePt(event)
    state.points.push([pt.x, pt.y])
    previewPen.value = [...state.points]
  }
}

function onCanvasPointerUp(event: PointerEvent): void {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  const state = drawState.value

  if (state.kind === 'shape') {
    const pt = getScenePt(event)
    const el = state.tool === 'rectangle'
      ? buildRectangleElement(state.ax, state.ay, pt.x, pt.y)
      : buildEllipseElement(state.ax, state.ay, pt.x, pt.y)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  } else if (state.kind === 'linear') {
    const pt = getScenePt(event)
    const el = buildLinearElement(state.tool, state.ax, state.ay, pt.x, pt.y)
    store.addElement(el as DiagramElement)
    cancelDraw()
  } else if (state.kind === 'pen') {
    const el = buildPenElement(state.points)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  }
  // text commits on blur/enter, not pointerup
}

function onCanvasPointerLeave(event: PointerEvent): void {
  // Only cancel pan; drawing uses pointer capture so leave won't fire mid-drag
  if (isPanning.value) {
    isPanning.value = false
  }
}

// ── Text commit ───────────────────────────────────────────────────────────────

function commitText(): void {
  const state = drawState.value
  if (state.kind !== 'text') return
  const el = buildTextElement(state.x, state.y, pendingText.value)
  if (el) store.addElement(el as DiagramElement)
  cancelDraw()
}

function onTextKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitText()
  } else if (event.key === 'Escape') {
    cancelDraw()
  }
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function onCanvasWheel(event: WheelEvent): void {
  event.preventDefault()
  const { zoom, scrollX, scrollY } = store.viewport
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
  if (newZoom === zoom) return

  // Zoom toward cursor: keep the scene point under cursor fixed.
  // Use clientX/clientY; offsetX is read-only in some environments (jsdom).
  const target = event.currentTarget as SVGElement
  const rect = target?.getBoundingClientRect?.()
  const cursorX = rect ? event.clientX - rect.left : 0
  const cursorY = rect ? event.clientY - rect.top : 0
  const scene = screenToScene({ x: cursorX, y: cursorY }, { scrollX, scrollY, zoom })

  store.setViewport({
    scrollX: cursorX / newZoom - scene.x,
    scrollY: cursorY / newZoom - scene.y,
    zoom: newZoom,
  })
}

// ── Element helpers ───────────────────────────────────────────────────────────

function pointsToAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

// Narrow helpers for accessing typed union fields without TS errors
type RectEl   = Extract<DiagramElement, { type: 'rectangle' }>
type EllEl    = Extract<DiagramElement, { type: 'ellipse' }>
type LineEl   = Extract<DiagramElement, { type: 'line' }>
type ArrowEl  = Extract<DiagramElement, { type: 'arrow' }>
type TextEl   = Extract<DiagramElement, { type: 'text' }>
type PenEl    = Extract<DiagramElement, { type: 'pen' }>

// ── Cursor ────────────────────────────────────────────────────────────────────

const canvasCursor = computed(() => {
  if (isPanTool()) return isPanning.value ? 'grabbing' : 'grab'
  if (isDrawingTool()) return 'crosshair'
  return 'default'
})

// ── Text position (scene coords used directly in foreignObject) ───────────────

const textEditState = computed(() => {
  const s = drawState.value
  if (s.kind !== 'text') return null
  return { x: s.x, y: s.y }
})
</script>

<template>
  <!-- Loading state -->
  <div
    v-if="store.loading"
    class="diagram-canvas-shell diagram-canvas-shell--loading"
    aria-live="polite"
  >
    <span class="diagram-spinner" aria-hidden="true" />
    <p>Loading diagram…</p>
  </div>

  <!-- Error state -->
  <div
    v-else-if="store.error"
    class="diagram-canvas-shell diagram-canvas-shell--error"
    role="alert"
  >
    <p class="diagram-error__message">Failed to load diagram: {{ store.error }}</p>
  </div>

  <!-- Canvas -->
  <svg
    v-else
    ref="svgEl"
    class="diagram-canvas"
    role="img"
    :aria-label="store.title || 'Diagram canvas'"
    :style="{ cursor: canvasCursor }"
    @pointerdown="onCanvasPointerDown"
    @pointermove="onCanvasPointerMove"
    @pointerup="onCanvasPointerUp"
    @pointerleave="onCanvasPointerLeave"
    @wheel.prevent="onCanvasWheel"
  >
    <defs>
      <marker
        id="diagram-arrowhead"
        markerWidth="10"
        markerHeight="7"
        refX="10"
        refY="3.5"
        orient="auto"
      >
        <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
      </marker>
    </defs>

    <g :transform="viewportTransform">
      <!-- Committed elements -->
      <template v-for="el in elements" :key="el.id">
        <!-- rectangle -->
        <rect
          v-if="el.type === 'rectangle'"
          :x="(el as RectEl).x"
          :y="(el as RectEl).y"
          :width="(el as RectEl).width"
          :height="(el as RectEl).height"
          :stroke="(el as RectEl).stroke"
          :fill="(el as RectEl).fill ?? 'none'"
          :stroke-width="(el as RectEl).strokeWidth"
        />

        <!-- ellipse -->
        <ellipse
          v-else-if="el.type === 'ellipse'"
          :cx="(el as EllEl).x + (el as EllEl).width / 2"
          :cy="(el as EllEl).y + (el as EllEl).height / 2"
          :rx="(el as EllEl).width / 2"
          :ry="(el as EllEl).height / 2"
          :stroke="(el as EllEl).stroke"
          :fill="(el as EllEl).fill ?? 'none'"
          :stroke-width="(el as EllEl).strokeWidth"
        />

        <!-- line -->
        <line
          v-else-if="el.type === 'line'"
          :x1="(el as LineEl).points[0][0]"
          :y1="(el as LineEl).points[0][1]"
          :x2="(el as LineEl).points[1][0]"
          :y2="(el as LineEl).points[1][1]"
          :stroke="(el as LineEl).stroke"
          :stroke-width="(el as LineEl).strokeWidth"
        />

        <!-- arrow -->
        <line
          v-else-if="el.type === 'arrow'"
          :x1="(el as ArrowEl).points[0][0]"
          :y1="(el as ArrowEl).points[0][1]"
          :x2="(el as ArrowEl).points[1][0]"
          :y2="(el as ArrowEl).points[1][1]"
          :stroke="(el as ArrowEl).stroke"
          :stroke-width="(el as ArrowEl).strokeWidth"
          marker-end="url(#diagram-arrowhead)"
        />

        <!-- text -->
        <text
          v-else-if="el.type === 'text'"
          :x="(el as TextEl).x"
          :y="(el as TextEl).y"
          :font-size="(el as TextEl).fontSize"
          :fill="(el as TextEl).color"
        >{{ (el as TextEl).text }}</text>

        <!-- pen -->
        <polyline
          v-else-if="el.type === 'pen'"
          :points="pointsToAttr((el as PenEl).points)"
          fill="none"
          :stroke="(el as PenEl).stroke"
          :stroke-width="(el as PenEl).strokeWidth"
        />
      </template>

      <!-- Preview: rectangle or ellipse in progress -->
      <rect
        v-if="previewShape && previewShape.type === 'rectangle'"
        class="diagram-preview"
        :x="previewShape.x"
        :y="previewShape.y"
        :width="previewShape.width"
        :height="previewShape.height"
        stroke="#1f2937"
        fill="none"
        stroke-width="2"
        stroke-dasharray="4 3"
      />
      <ellipse
        v-else-if="previewShape && previewShape.type === 'ellipse'"
        class="diagram-preview"
        :cx="previewShape.x + previewShape.width / 2"
        :cy="previewShape.y + previewShape.height / 2"
        :rx="previewShape.width / 2"
        :ry="previewShape.height / 2"
        stroke="#1f2937"
        fill="none"
        stroke-width="2"
        stroke-dasharray="4 3"
      />

      <!-- Preview: line or arrow in progress -->
      <line
        v-if="previewLinear && previewLinear.type === 'line'"
        class="diagram-preview"
        :x1="previewLinear.ax"
        :y1="previewLinear.ay"
        :x2="previewLinear.bx"
        :y2="previewLinear.by"
        stroke="#1f2937"
        stroke-width="2"
        stroke-dasharray="4 3"
      />
      <line
        v-else-if="previewLinear && previewLinear.type === 'arrow'"
        class="diagram-preview"
        :x1="previewLinear.ax"
        :y1="previewLinear.ay"
        :x2="previewLinear.bx"
        :y2="previewLinear.by"
        stroke="#1f2937"
        stroke-width="2"
        stroke-dasharray="4 3"
        marker-end="url(#diagram-arrowhead)"
      />

      <!-- Preview: pen stroke in progress -->
      <polyline
        v-if="previewPen && previewPen.length >= 2"
        class="diagram-preview"
        :points="pointsToAttr(previewPen)"
        fill="none"
        stroke="#1f2937"
        stroke-width="2"
        stroke-dasharray="4 3"
      />

      <!-- Text editing overlay (in scene coords via foreignObject) -->
      <foreignObject
        v-if="textEditState"
        :x="textEditState.x"
        :y="textEditState.y - 16"
        width="200"
        height="32"
        class="diagram-text-foreign"
      >
        <input
          ref="textInputRef"
          v-model="pendingText"
          class="diagram-text-input"
          type="text"
          aria-label="Enter text"
          @blur="commitText"
          @keydown="onTextKeyDown"
        />
      </foreignObject>
    </g>
  </svg>
</template>

<style scoped>
.diagram-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background-color: var(--color-bg, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  touch-action: none;
}

.diagram-canvas-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
  font-size: var(--text-sm, 0.875rem);
}

.diagram-canvas-shell--loading {
  color: var(--color-text-secondary, #6b7280);
}

.diagram-canvas-shell--error {
  color: var(--color-status-blocked, #ef4444);
}

.diagram-error__message {
  max-width: 40ch;
  text-align: center;
}

.diagram-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border, #e5e7eb);
  border-top-color: var(--color-accent, #6366f1);
  border-radius: 50%;
  animation: diagram-spin 0.7s linear infinite;
}

@keyframes diagram-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .diagram-spinner {
    animation: none;
  }
}

.diagram-preview {
  pointer-events: none;
}

.diagram-text-input {
  width: 100%;
  height: 100%;
  font-size: 16px;
  font-family: inherit;
  border: 1px solid var(--color-accent, #6366f1);
  background: var(--color-bg, #ffffff);
  color: var(--color-text, #1f2937);
  padding: 2px 4px;
  outline: none;
  box-sizing: border-box;
}
</style>
