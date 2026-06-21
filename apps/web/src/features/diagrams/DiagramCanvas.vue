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

// ── Hover tracking (Select tool only; suppressed while dragging/marquee) ──────

const hoveredElementId = ref<string | null>(null)

/** True whenever a pointer gesture is in flight — hover suppressed to avoid flicker. */
const isInteracting = computed(
  () => !!moveState.value || !!marqueeRect.value || isPanning.value,
)

function onHoverPointerMove(event: PointerEvent): void {
  // Only track hover under the Select tool, not during active gestures
  if (store.tool !== 'select' || isInteracting.value) {
    if (hoveredElementId.value !== null) hoveredElementId.value = null
    return
  }
  const target = event.target as Element | null
  const hit = target?.closest('[data-element-id]')
  const id = hit?.getAttribute('data-element-id') ?? null
  hoveredElementId.value = id
}

function onHoverPointerLeave(_event: PointerEvent): void {
  hoveredElementId.value = null
}

/** Wrapper that feeds both the pointer state machine and hover tracking. */
function onPointerMoveWithHover(event: PointerEvent): void {
  onCanvasPointerMove(event)
  onHoverPointerMove(event)
}

/** BBox of the currently hovered element, for rendering the hover outline. */
const hoveredElementBbox = computed(() => {
  if (!hoveredElementId.value || store.tool !== 'select' || isInteracting.value) return null
  // Skip if hovered element is already selected (selection outline takes over)
  if (store.selectedIds.includes(hoveredElementId.value)) return null
  const el = store.elements.find((e) => e.id === hoveredElementId.value)
  if (!el) return null
  return computeElementBbox(el)
})

// ── Computed for template ─────────────────────────────────────────────────────

const elements = computed(() => store.elements)

// ── Dot-grid background ───────────────────────────────────────────────────────

/**
 * patternTransform for the dot-grid pattern.
 *
 * The pattern is defined in a 24×24 userSpaceOnUse coordinate system.
 * Applying the same translate+scale as the viewport transform keeps dots
 * locked to scene space while the <rect> itself stays screen-space —
 * meaning only SVG attribute updates fire on pan/zoom, never DOM node churn.
 */
const dotGridPatternTransform = computed(() => {
  const { scrollX, scrollY, zoom } = store.viewport
  return `translate(${scrollX * zoom},${scrollY * zoom}) scale(${zoom})`
})

/** Hide the grid below 40% zoom — dots become illegibly dense. */
const dotGridVisible = computed(() => store.viewport.zoom >= 0.4)

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

/** Scene coords used directly in foreignObject (final x/y — no further offset needed). */
const textEditState = computed(() => {
  const s = drawState.value
  if (s.kind !== 'text') return null
  if (s.target === 'label') {
    // Center the 200×32 input over the shape's bbox center.
    // s.x/s.y are the bbox center; subtract half input dimensions (100 wide, 32 tall).
    return { x: s.x - 100, y: s.y - 16 }
  }
  // Text-element mode: shift input up by 16px so baseline aligns with the text node.
  return { x: s.x, y: s.y - 16 }
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
    const trimmed = pendingText.value.trim()
    if (state.target === 'label') {
      // Shape-label mode: always update, never delete; empty string clears the label.
      store.pushHistory()
      store.updateElement(state.elId, { label: trimmed } as Partial<DiagramElement>)
    } else {
      // Text-element mode: update or delete.
      if (trimmed) {
        store.pushHistory()
        store.updateElement(state.elId, { text: trimmed } as Partial<DiagramElement>)
      } else {
        store.removeElements([state.elId])
      }
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

// Prevent the browser from moving focus away from the text input when the user
// clicks on the SVG canvas while a text edit session is active. Mousedown (not
// pointerdown) is what triggers the browser's focus-management; preventing it
// keeps the foreignObject <input> focused so keystrokes reach it.
function onCanvasMouseDown(event: MouseEvent): void {
  if (drawState.value.kind === 'text') {
    event.preventDefault()
  }
}

// ── Double-click to edit existing text elements ───────────────────────────────

function onCanvasDblClick(event: MouseEvent): void {
  if (store.tool !== 'select') return

  const evTarget = event.target as Element | null
  if (!evTarget) return
  const hit = evTarget.closest('[data-element-id]')
  const elementId = hit ? (hit.getAttribute('data-element-id') ?? null) : null
  if (!elementId) return

  const el = store.elements.find((e) => e.id === elementId)
  if (!el) return

  if (el.type === 'rectangle' || el.type === 'ellipse') {
    openShapeLabelEdit(el)
    return
  }

  if (el.type === 'text') {
    drawState.value = { kind: 'text', x: el.x, y: el.y, elId: el.id }
    pendingText.value = el.text
    nextTick(() => textInputRef.value?.focus())
  }
}

function openShapeLabelEdit(el: DiagramElement): void {
  const bbox = computeElementBbox(el)
  const cx = bbox.x + bbox.width / 2
  const cy = bbox.y + bbox.height / 2
  drawState.value = { kind: 'text', x: cx, y: cy, elId: el.id, target: 'label' }
  pendingText.value = ('label' in el && typeof el.label === 'string') ? el.label : ''
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
    @mousedown="onCanvasMouseDown"
    @pointerdown="onCanvasPointerDown"
    @pointermove="onPointerMoveWithHover"
    @pointerup="onCanvasPointerUp"
    @pointerleave="(e: PointerEvent) => { onCanvasPointerLeave(); onHoverPointerLeave(e) }"
    @pointercancel="onCanvasPointerCancel"
    @dblclick="onCanvasDblClick"
    @wheel.prevent="onCanvasWheel"
  >
    <defs>
      <!-- Dot-grid pattern: 24×24 scene-space cell, single 1.5px dot at centre -->
      <pattern
        id="diagram-dot-grid"
        x="0"
        y="0"
        width="24"
        height="24"
        patternUnits="userSpaceOnUse"
        :patternTransform="dotGridPatternTransform"
      >
        <circle
          cx="12"
          cy="12"
          r="1.5"
          fill="color-mix(in srgb, var(--color-text-muted, #9ca3af) 25%, transparent)"
        />
      </pattern>

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

    <!-- Dot-grid background: screen-space rect, pattern shifts via patternTransform -->
    <rect
      v-if="dotGridVisible"
      class="diagram-dot-grid"
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="url(#diagram-dot-grid)"
      pointer-events="none"
    />

    <g
      :transform="viewportTransform"
      :style="{ '--diagram-hit-sw': 12 / store.viewport.zoom }"
    >
      <!-- Committed elements (hide the one actively being edited) -->
      <DiagramElementView
        v-for="el in elements"
        v-show="el.id !== editingElId || !editingElId"
        :key="el.id"
        :element="el"
      />

      <!-- Hover outline: light accent border under Select tool, not shown on selected elements -->
      <rect
        v-if="hoveredElementBbox"
        class="diagram-hover-outline"
        :x="hoveredElementBbox.x - 4 / store.viewport.zoom"
        :y="hoveredElementBbox.y - 4 / store.viewport.zoom"
        :width="hoveredElementBbox.width + 8 / store.viewport.zoom"
        :height="hoveredElementBbox.height + 8 / store.viewport.zoom"
        fill="none"
        stroke="var(--color-accent, #6366f1)"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        opacity="0.4"
        pointer-events="none"
      />

      <!-- Selection outline: solid 1px accent, 4px screen-space padding -->
      <rect
        v-if="selectionBBox"
        class="diagram-selection-outline"
        :x="selectionBBox.x - 4 / store.viewport.zoom"
        :y="selectionBBox.y - 4 / store.viewport.zoom"
        :width="selectionBBox.width + 8 / store.viewport.zoom"
        :height="selectionBBox.height + 8 / store.viewport.zoom"
        fill="none"
        stroke="var(--color-accent, #6366f1)"
        stroke-width="1"
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

      <!-- Marquee: accent-tinted translucent fill + solid 1px accent border -->
      <rect
        v-if="marqueeRect"
        class="diagram-marquee"
        :x="marqueeRect.x"
        :y="marqueeRect.y"
        :width="marqueeRect.width"
        :height="marqueeRect.height"
        fill="var(--color-marquee-fill, color-mix(in srgb, var(--color-accent, #6366f1) 10%, transparent))"
        stroke="var(--color-accent, #6366f1)"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
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
        :y="textEditState.y"
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

.diagram-dot-grid {
  pointer-events: none;
}

.diagram-hover-outline {
  pointer-events: none;
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
