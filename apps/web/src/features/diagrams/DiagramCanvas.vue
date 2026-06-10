<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import type { DiagramElement } from '@tasknote/shared'
import { useDiagramsStore, screenToScene } from '@/stores/diagrams'
import { DRAWING_TOOLS, useDrawState, buildTextElement } from './useDrawTools'
import { useSelection, computeElementBbox, unionBboxes } from './useSelection'
import { useMarquee } from './useMarquee'
import { useResize } from './useResize'
import { useCanvasPointer } from './useCanvasPointer'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import DiagramElementView from './DiagramElementView.vue'
import DiagramPreview from './DiagramPreview.vue'
import DiagramSelectionHandles from './DiagramSelectionHandles.vue'

// ── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{ diagramId: number }>()

// ── Store ────────────────────────────────────────────────────────────────────

const store = useDiagramsStore()

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

// ── Refs ─────────────────────────────────────────────────────────────────────

const svgEl = ref<SVGSVGElement | null>(null)

// ── Load ─────────────────────────────────────────────────────────────────────

async function loadCurrentDiagram() {
  await store.loadDiagram(props.diagramId)
}

onMounted(loadCurrentDiagram)
watch(() => props.diagramId, loadCurrentDiagram)

// ── Sub-composables ───────────────────────────────────────────────────────────

const drawTools = useDrawState()
const {
  drawState,
  pendingText,
  textInputRef,
  previewShape,
  previewLinear,
  previewPen,
  cancelDraw,
} = drawTools

const selection = useSelection()
const { moveState } = selection

const marquee = useMarquee()
const { marqueeRect } = marquee

const resize = useResize(
  () => store.elements,
  () => store.viewport,
)
const { beginResize } = resize

const pointer = useCanvasPointer(store, svgEl, drawTools, selection, marquee, resize)
const {
  isPanning,
  beginGestureHistory,
  capturePointerOnSvg,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasPointerLeave,
  onCanvasPointerCancel,
} = pointer

useCanvasKeyboard(store, drawTools)

// ── Canvas size tracking (for toolbar zoom-around-center) ─────────────────────

let canvasResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (svgEl.value && typeof ResizeObserver !== 'undefined') {
    canvasResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      store.setCanvasSize(entry.contentRect.width, entry.contentRect.height)
    })
    canvasResizeObserver.observe(svgEl.value)
  }
})

onUnmounted(() => {
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = null
  // Persist any pending edit immediately instead of waiting out the debounce
  // when the canvas is torn down (e.g. navigating back to the list).
  void store.flushSave()
})

// ── Computed for template ─────────────────────────────────────────────────────

const elements = computed(() => store.elements)

const viewportTransform = computed(() => {
  const { scrollX, scrollY, zoom } = store.viewport
  // scene→screen: screen = (scene + scroll) * zoom
  // SVG translate(tx,ty) scale(s) maps point p → s*p + (tx,ty)
  // So tx = scrollX*zoom, ty = scrollY*zoom, s = zoom
  return `translate(${scrollX * zoom},${scrollY * zoom}) scale(${zoom})`
})

const selectedElements = computed<DiagramElement[]>(() =>
  store.elements.filter((e) => store.selectedIds.includes(e.id)),
)

const selectionBBox = computed(() => {
  if (selectedElements.value.length === 0) return null
  return unionBboxes(selectedElements.value.map(computeElementBbox))
})

/** Only show resize handles for single-element selections (multi-select shows outline only). */
const showResizeHandles = computed(() => selectedElements.value.length === 1)

/** The single selected element, or null when 0 or 2+ are selected. */
const singleSelectedElement = computed<DiagramElement | null>(() =>
  selectedElements.value.length === 1 ? selectedElements.value[0]! : null,
)

const canvasCursor = computed(() => {
  if (store.tool === 'hand') return isPanning.value ? 'grabbing' : 'grab'
  if (DRAWING_TOOLS.has(store.tool)) return 'crosshair'
  if (store.tool === 'select') return moveState.value ? 'move' : 'default'
  return 'default'
})

/** Scene coords used directly in foreignObject. */
const textEditState = computed(() => {
  const s = drawState.value
  if (s.kind !== 'text') return null
  return { x: s.x, y: s.y }
})

/** The element id currently being edited in text mode (empty string = new). */
const editingElId = computed(() => {
  const s = drawState.value
  if (s.kind !== 'text') return ''
  return s.elId
})

// ── Wheel (zoom/pan) ──────────────────────────────────────────────────────────

function onCanvasWheel(event: WheelEvent): void {
  event.preventDefault()
  const { zoom, scrollX, scrollY } = store.viewport

  if (event.ctrlKey || event.metaKey) {
    // Pinch-to-zoom (trackpad) arrives as ctrl+wheel. Also handles cmd+wheel.
    // Keep the scene point under the cursor fixed while zooming.
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    if (newZoom === zoom) return

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
  } else {
    // Plain scroll → pan. Natural direction: content follows the scroll gesture.
    // Scene delta = screen delta / zoom so panning stays proportional at any zoom.
    store.setViewport({
      scrollX: scrollX - event.deltaX / zoom,
      scrollY: scrollY - event.deltaY / zoom,
      zoom,
    })
  }
}

// ── Text commit ───────────────────────────────────────────────────────────────

function commitText(): void {
  const state = drawState.value
  if (state.kind !== 'text') return

  if (state.elId) {
    // Edit mode: update or delete the existing element.
    const trimmed = pendingText.value.trim()
    if (trimmed) {
      store.pushHistory()
      store.updateElement(state.elId, { text: trimmed } as Partial<DiagramElement>)
    } else {
      store.removeElements([state.elId])
    }
    cancelDraw()
    return
  }

  // Create mode: build a new text element.
  const style = { stroke: store.lastStroke, fontSize: store.lastFontSize }
  const el = buildTextElement(state.x, state.y, pendingText.value, style)
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

// ── Double-click to edit existing text elements ───────────────────────────────

function onCanvasDblClick(event: MouseEvent): void {
  if (store.tool !== 'select') return

  const target = event.target as Element | null
  if (!target) return
  const hit = target.closest('[data-element-id]')
  const elementId = hit ? (hit.getAttribute('data-element-id') ?? null) : null
  if (!elementId) return

  const el = store.elements.find((e) => e.id === elementId)
  if (!el || el.type !== 'text') return

  drawState.value = { kind: 'text', x: el.x, y: el.y, elId: el.id }
  pendingText.value = el.text
  nextTick(() => textInputRef.value?.focus())
}
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

  <!-- Error state (load failure only — save errors stay in the toolbar) -->
  <div
    v-else-if="store.loadError"
    class="diagram-canvas-shell diagram-canvas-shell--error"
    role="alert"
  >
    <p class="diagram-error__message">Failed to load diagram: {{ store.loadError }}</p>
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
    @pointercancel="onCanvasPointerCancel"
    @dblclick="onCanvasDblClick"
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
      <!-- Committed elements (hide the one actively being edited) -->
      <DiagramElementView
        v-for="el in elements"
        v-show="el.id !== editingElId || !editingElId"
        :key="el.id"
        :element="el"
        :zoom="store.viewport.zoom"
      />

      <!-- Selection outline -->
      <rect
        v-if="selectionBBox"
        class="diagram-selection-outline"
        :x="selectionBBox.x - 4"
        :y="selectionBBox.y - 4"
        :width="selectionBBox.width + 8"
        :height="selectionBBox.height + 8"
        fill="none"
        stroke="var(--color-accent, #6366f1)"
        stroke-width="1.5"
        stroke-dasharray="5 3"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
      />

      <!-- Resize handles (single-element selection only) -->
      <DiagramSelectionHandles
        v-if="showResizeHandles && selectionBBox"
        :bbox="selectionBBox"
        :zoom="store.viewport.zoom"
        :show-endpoint-handles="singleSelectedElement?.type === 'line' || singleSelectedElement?.type === 'arrow'"
        :element="singleSelectedElement"
        @resize-start="(handleId, screenX, screenY, pointerEvent) => {
          const selectedId = store.selectedIds[0]
          if (selectedId) {
            beginGestureHistory([...store.elements])
            beginResize(selectedId, handleId, screenX, screenY)
            // Capture on the SVG so existing onCanvasPointerMove/Up flow handles
            // move/up events. The handle's stopPropagation prevents this event
            // from reaching onCanvasPointerDown, so we capture explicitly here.
            // capturePointerOnSvg targets svgEl directly since pointerEvent.currentTarget
            // is the handle element, not the SVG.
            capturePointerOnSvg(pointerEvent.pointerId)
          }
        }"
      />

      <!-- Marquee selection rectangle (dashed outline while dragging) -->
      <rect
        v-if="marqueeRect"
        class="diagram-marquee"
        :x="marqueeRect.x"
        :y="marqueeRect.y"
        :width="marqueeRect.width"
        :height="marqueeRect.height"
        fill="none"
        stroke="var(--color-accent, #6366f1)"
        stroke-width="1"
        stroke-dasharray="4 3"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        opacity="0.7"
      />

      <!-- In-progress draft preview -->
      <DiagramPreview
        :shape="previewShape"
        :linear="previewLinear"
        :pen="previewPen"
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
  /* Drives `currentColor` for committed-element and preview strokes so they
     stay visible (and theme-correct) in both light and dark mode. */
  color: var(--color-text-primary, #1f2937);
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

.diagram-selection-outline {
  pointer-events: none;
}

.diagram-marquee {
  pointer-events: none;
}

.diagram-text-input {
  width: 100%;
  height: 100%;
  font-size: 16px;
  font-family: inherit;
  border: 1px solid var(--color-accent, #6366f1);
  background: var(--color-surface, #ffffff);
  color: var(--color-text-primary, #1f2937);
  padding: 2px 4px;
  outline: none;
  box-sizing: border-box;
}
</style>
