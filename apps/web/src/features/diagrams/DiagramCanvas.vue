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
  unionBboxes,
} from './useSelection'
import { useMarquee } from './useMarquee'
import { useResize } from './useResize'
import { resolveShapeIdAtPoint, elementCenter, findElementById, boundEndpoint } from './connectors'
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
const { marqueeRect, active: marqueeActive, startMarquee, updateMarquee, finishMarquee, cancelMarquee } = useMarquee()
const { resizeState, beginResize, updateResize, commitResize, cancelResize, isResizing } = useResize(
  () => store.elements,
  () => store.viewport,
)

// ── Gesture-scoped history ────────────────────────────────────────────────────
//
// History is pushed at most once per gesture (move or resize), and only when
// the gesture actually changes geometry. We capture the pre-gesture snapshot at
// pointerdown and defer the push until the first pointermove that applies a
// patch. A plain click (down → up with no move) never calls pushHistory at all.

const gestureHistorySnapshot = ref<import('@tasknote/shared').DiagramElement[] | null>(null)
const gestureHistoryPushed = ref(false)

/** Call at the start of any move/resize gesture (before any mutation). */
function beginGestureHistory(snapshot: import('@tasknote/shared').DiagramElement[]): void {
  gestureHistorySnapshot.value = snapshot
  gestureHistoryPushed.value = false
}

/**
 * Call on the first pointermove of a gesture, BEFORE applying the patch.
 * Pushes the pre-gesture snapshot exactly once per gesture.
 */
function pushGestureHistoryOnce(): void {
  if (gestureHistoryPushed.value) return
  const snapshot = gestureHistorySnapshot.value
  if (snapshot !== null) {
    store.pushHistory(snapshot)
    gestureHistoryPushed.value = true
  }
}

/** Call at gesture end (pointerup / cancel) to reset gesture state. */
function endGestureHistory(): void {
  gestureHistorySnapshot.value = null
  gestureHistoryPushed.value = false
}

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
const singleSelectedElement = computed<import('@tasknote/shared').DiagramElement | null>(() =>
  selectedElements.value.length === 1 ? selectedElements.value[0]! : null,
)

// ── Escape + Delete handler ───────────────────────────────────────────────────

function isTextInputFocused(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable
}

// ── Tool shortcut map ─────────────────────────────────────────────────────────

const TOOL_SHORTCUTS: Record<string, string> = {
  v: 'select',
  h: 'hand',
  r: 'rectangle',
  e: 'ellipse',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  t: 'text',
  p: 'pen',
}

// ── Arrow-key nudge: debounced history ────────────────────────────────────────

const NUDGE_HISTORY_DEBOUNCE_MS = 500

const lastNudgeTimestamp = ref(0)

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelDraw()
    store.selectElement(null)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (isTextInputFocused()) return
    if (store.selectedIds.length === 0) return
    store.removeElements(store.selectedIds)
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
    return
  }
  if (isMod && event.key === 'Z') {
    // Shift+Cmd+Z on some platforms produces uppercase Z without shiftKey flag
    if (isTextInputFocused()) return
    event.preventDefault()
    store.redoAction()
    return
  }

  // Arrow-key nudge: moves all selected elements
  const isArrowKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'
  if (isArrowKey) {
    if (isTextInputFocused()) return
    if (store.selectedIds.length === 0) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    const now = Date.now()
    if (now - lastNudgeTimestamp.value > NUDGE_HISTORY_DEBOUNCE_MS) {
      store.pushHistory()
    }
    lastNudgeTimestamp.value = now
    for (const id of store.selectedIds) {
      const original = store.elements.find((e) => e.id === id)
      if (original) {
        const patch = buildMovePatch(original, dx, dy)
        store.updateElement(id, patch)
      }
    }
    return
  }

  // Tool shortcuts: no modifier keys allowed
  if (isMod || event.altKey) return
  if (isTextInputFocused()) return
  const tool = TOOL_SHORTCUTS[event.key.toLowerCase()]
  if (tool) {
    store.setTool(tool)
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

/**
 * Capture the pointer on the SVG canvas element by pointerId.
 * Used when the initiating event originated on a child element (e.g. a resize
 * handle) and event.currentTarget is not the SVG — we still want capture on
 * the SVG so the existing onCanvasPointerMove/Up handlers receive all events.
 */
function capturePointerOnSvg(pointerId: number): void {
  const svg = svgEl.value
  if (svg?.setPointerCapture) {
    svg.setPointerCapture(pointerId)
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
    if (event.shiftKey) {
      // Shift+click toggles membership without starting a move.
      store.selectElement(elementId, true)
    } else {
      // If clicking an already-selected element, start a group move without
      // changing the selection. Otherwise replace the selection.
      if (!store.selectedIds.includes(elementId)) {
        store.selectElement(elementId)
      }
      const originalsInSelection = store.elements.filter((e) =>
        store.selectedIds.includes(e.id),
      )
      if (originalsInSelection.length > 0) {
        // Capture pre-gesture snapshot; history is pushed only on first actual
        // pointermove — a bare click (down → up, no move) adds nothing.
        beginGestureHistory([...store.elements])
        beginMove(
          originalsInSelection.map((e) => e.id),
          event.clientX,
          event.clientY,
          originalsInSelection.map((e) => ({ ...e }) as DiagramElement),
        )
      }
      capturePointer(event)
    }
  } else {
    store.selectElement(null)
    clearMove()
    // Begin marquee on empty canvas click.
    const pt = getScenePt(event)
    startMarquee(pt.x, pt.y)
    capturePointer(event)
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
  // Defensive: if a previous gesture was never properly ended (e.g., pointer
  // released outside the browser window mid-resize), reset stale state so the
  // new interaction starts clean without inheriting stale geometry.
  if (isResizing.value) {
    cancelResize()
    endGestureHistory()
  }
  if (moveState.value) {
    clearMove()
    endGestureHistory()
  }
  if (marqueeActive.value) {
    cancelMarquee()
  }

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

  if (isResizing.value) {
    const state = resizeState.value
    if (state) {
      const patch = updateResize(event.clientX, event.clientY)
      if (patch) {
        // Push the pre-gesture snapshot exactly once, before the first mutation.
        pushGestureHistoryOnce()
        store.updateElement(state.elementId, patch)
      }
    }
    return
  }

  const mv = moveState.value
  if (mv) {
    const zoom = store.viewport.zoom
    const dxScreen = event.clientX - mv.startScreenX
    const dyScreen = event.clientY - mv.startScreenY
    const dxScene = dxScreen / zoom
    const dyScene = dyScreen / zoom
    // Push the pre-gesture snapshot exactly once, before the first mutation.
    pushGestureHistoryOnce()
    for (const id of mv.ids) {
      const original = mv.originalElements.get(id)
      if (original) {
        const patch = buildMovePatch(original, dxScene, dyScene)
        store.updateElement(id, patch)
      }
    }
    return
  }

  if (marqueeActive.value) {
    const pt = getScenePt(event)
    updateMarquee(pt.x, pt.y)
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

  // Compute edge-anchored endpoints.
  // Each bound end needs the OTHER end's position as `from` so the anchor
  // lands on the boundary facing the incoming ray.
  let ax = state.ax
  let ay = state.ay
  let bx = rawEnd.x
  let by = rawEnd.y

  if (startEl && endEl) {
    // Both bound: anchor each end toward the other shape's center.
    const endCenter = elementCenter(endEl)
    const startCenter = elementCenter(startEl)
    const startPt = boundEndpoint(startEl, endCenter)
    const endPt = boundEndpoint(endEl, startCenter)
    ax = startPt.x; ay = startPt.y
    bx = endPt.x;   by = endPt.y
  } else if (startEl) {
    // Only start is bound; `from` for the start anchor is the raw end point.
    const startPt = boundEndpoint(startEl, rawEnd)
    ax = startPt.x; ay = startPt.y
  } else if (endEl) {
    // Only end is bound; `from` for the end anchor is the raw start point.
    const rawStart = { x: state.ax, y: state.ay }
    const endPt = boundEndpoint(endEl, rawStart)
    bx = endPt.x; by = endPt.y
  }

  return {
    ax, ay, bx, by,
    startBinding: startId ? { elementId: startId } : null,
    endBinding: endId ? { elementId: endId } : null,
  }
}

function onCanvasPointerUp(event: PointerEvent): void {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (isResizing.value) {
    const state = resizeState.value
    if (state) {
      const result = commitResize(event.clientX, event.clientY)
      if (result) {
        const { patch, newBindings } = result
        if (newBindings) {
          store.updateElement(state.elementId, { ...patch, ...newBindings } as Partial<DiagramElement>)
        } else {
          store.updateElement(state.elementId, patch)
        }
      }
    }
    endGestureHistory()
    return
  }

  if (moveState.value) {
    // Final commit already applied via pointermove; just end the move.
    clearMove()
    endGestureHistory()
    return
  }

  if (marqueeActive.value) {
    const ids = finishMarquee(store.elements)
    if (ids.length > 0) {
      // Replace selection with all intersecting elements.
      store.selectElement(ids[0]!)
      for (let i = 1; i < ids.length; i++) {
        store.selectElement(ids[i]!, true)
      }
    } else {
      store.selectElement(null)
    }
    return
  }

  const state = drawState.value

  if (state.kind === 'shape') {
    const pt = getScenePt(event)
    const style = { stroke: store.lastStroke, fill: store.lastFill, strokeWidth: store.lastStrokeWidth }
    const el = state.tool === 'rectangle'
      ? buildRectangleElement(state.ax, state.ay, pt.x, pt.y, style)
      : buildEllipseElement(state.ax, state.ay, pt.x, pt.y, style)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  } else if (state.kind === 'linear') {
    const { ax, ay, bx, by, startBinding, endBinding } = resolveLinearEndpoints(state, event)
    const style = { stroke: store.lastStroke, strokeWidth: store.lastStrokeWidth }
    const el = buildLinearElement(state.tool, ax, ay, bx, by, startBinding, endBinding, style)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  } else if (state.kind === 'pen') {
    const style = { stroke: store.lastStroke, strokeWidth: store.lastStrokeWidth }
    const el = buildPenElement(state.points, style)
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
  cancelResize()
  cancelMarquee()
  isPanning.value = false
  endGestureHistory()
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

  // Create mode: build a new element.
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

/** The element id currently being edited in text mode (empty string = new). */
const editingElId = computed(() => {
  const s = drawState.value
  if (s.kind !== 'text') return ''
  return s.elId
})

// ── Double-click to edit existing text elements ───────────────────────────────

function onCanvasDblClick(event: MouseEvent): void {
  if (store.tool !== 'select') return

  // Use a PointerEvent-like object for hitElementId — target is all we need.
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
