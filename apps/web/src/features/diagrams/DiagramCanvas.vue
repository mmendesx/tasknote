<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'
import { useDiagramsStore, screenToScene } from '@/stores/diagrams'

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

function isPanTool(): boolean {
  return store.tool === 'hand'
}

// Seam for ICT-6/7: this function handles canvas-level pointer interactions.
// Currently only pan is wired; ICT-6 will add drawing and ICT-7 will add selection.
function onCanvasPointerDown(event: PointerEvent): void {
  if (!isPanTool()) return
  isPanning.value = true
  panOrigin.value = { x: event.clientX, y: event.clientY }
  panViewportStart.value = { ...store.viewport }
  const target = event.currentTarget as SVGElement
  if (target?.setPointerCapture) {
    target.setPointerCapture(event.pointerId)
  }
}

function onCanvasPointerMove(event: PointerEvent): void {
  if (!isPanning.value) return
  const dx = event.clientX - panOrigin.value.x
  const dy = event.clientY - panOrigin.value.y
  const zoom = panViewportStart.value.zoom
  store.setViewport({
    scrollX: panViewportStart.value.scrollX + dx / zoom,
    scrollY: panViewportStart.value.scrollY + dy / zoom,
    zoom,
  })
}

function onCanvasPointerUp(): void {
  isPanning.value = false
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
    class="diagram-canvas"
    role="img"
    :aria-label="store.title || 'Diagram canvas'"
    :style="{ cursor: isPanTool() ? (isPanning ? 'grabbing' : 'grab') : 'default' }"
    @pointerdown="onCanvasPointerDown"
    @pointermove="onCanvasPointerMove"
    @pointerup="onCanvasPointerUp"
    @pointerleave="onCanvasPointerUp"
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
</style>
