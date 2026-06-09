<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import type { DiagramBinding, DiagramElement, DiagramViewport } from '@tasknote/shared'
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
import {
  useSelection,
  computeElementBbox,
  buildMovePatch,
} from './useSelection'
import { resolveShapeIdAtPoint, elementCenter, findElementById } from './connectors'
import DiagramElementView from './DiagramElementView.vue'
import DiagramPreview from './DiagramPreview.vue'

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

// ── Selection state ───────────────────────────────────────────────────────────

const { moveState, beginMove, clearMove } = useSelection()

const selectedElement = computed<DiagramElement | null>(() => {
  if (!store.selectedId) return null
  return store.elements.find((e) => e.id === store.selectedId) ?? null
})

const selectionBBox = computed(() => {
  if (!selectedElement.value) return null
  return computeElementBbox(selectedElement.value)
})

// ── Escape + Delete handler ───────────────────────────────────────────────────

function isTextInputFocused(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelDraw()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (isTextInputFocused()) return
    const idToRemove = store.selectedId
    if (!idToRemove) return
    store.removeElement(idToRemove)
    store.selectElement(null)
    return
  }
  const isMod = event.ctrlKey || event.metaKey
  if (isMod && event.key === 'z') {
    if (isTextInputFocused()) return
    event.preventDefault()
    if (event.shiftKey) {
      store.redoAction()
    } else {
      store.undoAction()
    }
  }
  if (isMod && event.key === 'Z') {
    // Shift+Cmd+Z on some platforms produces uppercase Z without shiftKey flag
    if (isTextInputFocused()) return
    event.preventDefault()
    store.redoAction()
  }
}

// ── Canvas size tracking (for toolbar zoom-around-center) ─────────────────────

let canvasResizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)

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
  window.removeEventListener('keydown', onKeyDown)
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = null
  // Persist any pending edit immediately instead of waiting out the debounce
  // when the canvas is torn down (e.g. navigating back to the list).
  void store.flushSave()
})

// ── Pointer helpers ───────────────────────────────────────────────────────────

function getScenePt(event: PointerEvent): { x: number; y: number } {
  const el = svgEl.value as SVGElement | null
  if (!el) return screenToScene({ x: event.clientX, y: event.clientY }, store.viewport)
  return getScenePoint(event, el, store.viewport)
}

// ── Select tool hit-test ──────────────────────────────────────────────────────

function hitElementId(event: PointerEvent): string | null {
  const target = event.target as Element | null
  if (!target) return null
  const hit = target.closest('[data-element-id]')
  return hit ? (hit.getAttribute('data-element-id') ?? null) : null
}

function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget as SVGElement
  if (target?.setPointerCapture) {
    target.setPointerCapture(event.pointerId)
  }
}

// ── Pointer-down branch handlers ──────────────────────────────────────────────

function handlePanPointerDown(event: PointerEvent): void {
  isPanning.value = true
  panOrigin.value = { x: event.clientX, y: event.clientY }
  panViewportStart.value = { ...store.viewport }
  capturePointer(event)
}

function handleSelectPointerDown(event: PointerEvent): void {
  const elementId = hitElementId(event)
  if (elementId) {
    store.selectElement(elementId)
    const original = store.elements.find((e) => e.id === elementId)
    if (original) {
      // Push the pre-gesture snapshot so the entire drag is one undo entry.
      store.pushHistory()
      beginMove(elementId, event.clientX, event.clientY, { ...original } as DiagramElement)
    }
    capturePointer(event)
  } else {
    store.selectElement(null)
    clearMove()
  }
}

function handleDrawPointerDown(event: PointerEvent): void {
  const pt = getScenePt(event)
  const tool = store.tool

  if (tool === 'rectangle' || tool === 'ellipse') {
    drawState.value = { kind: 'shape', tool, ax: pt.x, ay: pt.y }
    previewShape.value = { type: tool, x: pt.x, y: pt.y, width: 0, height: 0 }
  } else if (tool === 'line' || tool === 'arrow') {
    const startShapeId = tool === 'arrow'
      ? resolveShapeIdAtPoint(event.clientX, event.clientY, store.elements)
      : null
    drawState.value = { kind: 'linear', tool, ax: pt.x, ay: pt.y, startShapeId }
    previewLinear.value = { type: tool, ax: pt.x, ay: pt.y, bx: pt.x, by: pt.y }
  } else if (tool === 'text') {
    drawState.value = { kind: 'text', x: pt.x, y: pt.y, elId: '' }
    pendingText.value = ''
    nextTick(() => textInputRef.value?.focus())
  } else if (tool === 'pen') {
    drawState.value = { kind: 'pen', points: [[pt.x, pt.y]] }
    previewPen.value = [[pt.x, pt.y]]
  }

  // Text is click-to-place (no drag): capturing the pointer to the SVG steals
  // focus from the foreignObject <input>, so keystrokes never reach it. Only the
  // drag tools need pointer capture.
  if (tool !== 'text') capturePointer(event)
}

// ── Pointer handlers ──────────────────────────────────────────────────────────

// Seam for ICT-6/7: dispatches by tool to the appropriate handler.
function onCanvasPointerDown(event: PointerEvent): void {
  if (isPanTool()) return handlePanPointerDown(event)
  if (store.tool === 'select') return handleSelectPointerDown(event)
  if (isDrawingTool()) return handleDrawPointerDown(event)
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

  const mv = moveState.value
  if (mv) {
    const zoom = store.viewport.zoom
    const dxScreen = event.clientX - mv.startScreenX
    const dyScreen = event.clientY - mv.startScreenY
    const dxScene = dxScreen / zoom
    const dyScene = dyScreen / zoom
    const patch = buildMovePatch(mv.originalElement, dxScene, dyScene)
    store.updateElement(mv.id, patch)
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
    const lastPt = state.points[state.points.length - 1]
    if (Math.hypot(pt.x - lastPt[0], pt.y - lastPt[1]) < 2) return
    state.points.push([pt.x, pt.y])
    previewPen.value = [...state.points]
  }
}

// ── Linear endpoint resolution ────────────────────────────────────────────────

type LinearEndpoints = {
  ax: number; ay: number; bx: number; by: number
  startBinding: DiagramBinding | null
  endBinding: DiagramBinding | null
}

function resolveLinearEndpoints(
  state: { tool: 'line' | 'arrow'; ax: number; ay: number; startShapeId?: string | null },
  event: PointerEvent,
): LinearEndpoints {
  const rawEnd = getScenePt(event)

  if (state.tool !== 'arrow') {
    return { ax: state.ax, ay: state.ay, bx: rawEnd.x, by: rawEnd.y, startBinding: null, endBinding: null }
  }

  const startId = state.startShapeId ?? null
  const endId = resolveShapeIdAtPoint(event.clientX, event.clientY, store.elements)

  const startEl = startId ? findElementById(store.elements, startId) : undefined
  const endEl = endId ? findElementById(store.elements, endId) : undefined

  const startCenter = startEl ? elementCenter(startEl) : null
  const endCenter = endEl ? elementCenter(endEl) : null

  return {
    ax: startCenter ? startCenter.x : state.ax,
    ay: startCenter ? startCenter.y : state.ay,
    bx: endCenter ? endCenter.x : rawEnd.x,
    by: endCenter ? endCenter.y : rawEnd.y,
    startBinding: startId ? { elementId: startId } : null,
    endBinding: endId ? { elementId: endId } : null,
  }
}

function onCanvasPointerUp(event: PointerEvent): void {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (moveState.value) {
    // Final commit already applied via pointermove; just end the move.
    clearMove()
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
    const { ax, ay, bx, by, startBinding, endBinding } = resolveLinearEndpoints(state, event)
    const el = buildLinearElement(state.tool, ax, ay, bx, by, startBinding, endBinding)
    if (el) store.addElement(el as DiagramElement)
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

function onCanvasPointerCancel(): void {
  cancelDraw()
  clearMove()
  isPanning.value = false
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

// ── Zoom / Pan via wheel ──────────────────────────────────────────────────────

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

// ── Cursor ────────────────────────────────────────────────────────────────────

const canvasCursor = computed(() => {
  if (isPanTool()) return isPanning.value ? 'grabbing' : 'grab'
  if (isDrawingTool()) return 'crosshair'
  if (store.tool === 'select') return moveState.value ? 'move' : 'default'
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
      <DiagramElementView
        v-for="el in elements"
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
