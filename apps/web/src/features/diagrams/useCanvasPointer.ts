import { ref, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { DiagramBinding, DiagramElement } from '@tasknote/shared'
import { screenToScene } from '@/stores/diagrams'
import type { useDiagramsStore } from '@/stores/diagrams'
import {
  DRAWING_TOOLS,
  getScenePoint,
  buildRectangleElement,
  buildEllipseElement,
  buildLinearElement,
  buildPenElement,
} from './useDrawTools'
import type { useDrawState } from './useDrawTools'
import { buildMovePatch } from './useSelection'
import type { useSelection } from './useSelection'
import type { useMarquee } from './useMarquee'
import type { useResize } from './useResize'
import { resolveShapeIdAtPoint, elementCenter, findElementById } from './connectors'
import { facingSideAnchor } from './orthogonalRoute'

// ── Types ─────────────────────────────────────────────────────────────────────

type Store = ReturnType<typeof useDiagramsStore>
type DrawState = ReturnType<typeof useDrawState>
type SelectionState = ReturnType<typeof useSelection>
type MarqueeState = ReturnType<typeof useMarquee>
type ResizeState = ReturnType<typeof useResize>

type LinearEndpoints = {
  ax: number; ay: number; bx: number; by: number
  startBinding: DiagramBinding | null
  endBinding: DiagramBinding | null
}

// ── Composable ────────────────────────────────────────────────────────────────

/**
 * Encapsulates the full pointer state machine for the diagram canvas.
 * Deps are passed explicitly so this composable has no hidden cross-imports.
 */
export function useCanvasPointer(
  store: Store,
  svgEl: Ref<SVGSVGElement | null>,
  drawTools: DrawState,
  selection: SelectionState,
  marquee: MarqueeState,
  resize: ResizeState,
) {
  const { drawState, pendingText, textInputRef, previewShape, previewLinear, previewPen, cancelDraw } = drawTools
  const { moveState, beginMove, clearMove } = selection
  const { isActive: marqueeIsActive, startMarquee, updateMarquee, finishMarquee, cancelMarquee } = marquee
  const { resizeState, updateResize, commitResize, cancelResize, isResizing } = resize

  // ── Pan state ──────────────────────────────────────────────────────────────

  const isPanning = ref(false)
  const panOrigin = ref({ x: 0, y: 0 })
  const panViewportStart = ref({ scrollX: 0, scrollY: 0, zoom: 1 })

  // ── Gesture-scoped history ─────────────────────────────────────────────────
  //
  // History is pushed at most once per gesture (move or resize), and only when
  // the gesture actually changes geometry. We capture the pre-gesture snapshot at
  // pointerdown and defer the push until the first pointermove that applies a
  // patch. A plain click (down → up with no move) never calls pushHistory at all.

  const gestureHistorySnapshot = ref<DiagramElement[] | null>(null)
  const gestureHistoryPushed = ref(false)

  /** Call at the start of any move/resize gesture (before any mutation). */
  function beginGestureHistory(snapshot: DiagramElement[]): void {
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

  // ── Pointer helpers ────────────────────────────────────────────────────────

  function getScenePt(event: PointerEvent): { x: number; y: number } {
    const el = svgEl.value as SVGElement | null
    if (!el) return screenToScene({ x: event.clientX, y: event.clientY }, store.viewport)
    return getScenePoint(event, el, store.viewport)
  }

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

  // ── Pointer-down branch handlers ───────────────────────────────────────────

  function handlePanPointerDown(event: PointerEvent): void {
    isPanning.value = true
    panOrigin.value = { x: event.clientX, y: event.clientY }
    panViewportStart.value = { ...store.viewport }
    capturePointer(event)
  }

  function handleSelectPointerDown(event: PointerEvent): void {
    const elementId = hitElementId(event)
    if (elementId) {
      handleSelectHitElement(event, elementId)
    } else {
      handleSelectHitEmpty(event)
    }
  }

  function handleSelectHitElement(event: PointerEvent, elementId: string): void {
    if (event.shiftKey) {
      // Shift+click toggles membership without starting a move.
      store.selectElement(elementId, true)
      return
    }
    // If clicking an already-selected element, start a group move without
    // changing the selection. Otherwise replace the selection.
    if (!store.selectedIds.includes(elementId)) {
      store.selectElement(elementId)
    }
    const originalsInSelection = store.elements.filter((e) => store.selectedIds.includes(e.id))
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
    // NOTE: do NOT capture the pointer here. Capturing on the first pointerdown of
    // a double-click suppresses the native dblclick (used to open the label editor).
    // Capture is deferred to the first real pointermove (handleMovePointerMove), so a
    // bare click — and thus a double-click — fires normally.
  }

  function handleSelectHitEmpty(event: PointerEvent): void {
    store.selectElement(null)
    clearMove()
    // Begin marquee on empty canvas click.
    const pt = getScenePt(event)
    startMarquee(pt.x, pt.y)
    capturePointer(event)
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
      // previewPen and drawState share ONE reactive array: per-move appends
      // mutate it in place (deep-ref reactivity), so no per-frame copying.
      previewPen.value = [[pt.x, pt.y]]
      drawState.value = { kind: 'pen', points: previewPen.value }
    }

    // Text is click-to-place (no drag): capturing the pointer to the SVG steals
    // focus from the foreignObject <input>, so keystrokes never reach it. Only the
    // drag tools need pointer capture.
    if (tool !== 'text') capturePointer(event)
  }

  // ── Linear endpoint resolution ─────────────────────────────────────────────

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
    return resolveArrowEndpoints(state, rawEnd, startId, endId)
  }

  function resolveArrowEndpoints(
    state: { ax: number; ay: number },
    rawEnd: { x: number; y: number },
    startId: string | null,
    endId: string | null,
  ): LinearEndpoints {
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
      const [sax, say] = facingSideAnchor(startEl, [endCenter.x, endCenter.y])
      const [ebx, eby] = facingSideAnchor(endEl, [startCenter.x, startCenter.y])
      ax = sax; ay = say
      bx = ebx; by = eby
    } else if (startEl) {
      // Only start is bound; `from` for the start anchor is the raw end point.
      const [sax, say] = facingSideAnchor(startEl, [rawEnd.x, rawEnd.y])
      ax = sax; ay = say
    } else if (endEl) {
      // Only end is bound; `from` for the end anchor is the raw start point.
      const [ebx, eby] = facingSideAnchor(endEl, [state.ax, state.ay])
      bx = ebx; by = eby
    }

    return {
      ax, ay, bx, by,
      startBinding: startId ? { elementId: startId } : null,
      endBinding: endId ? { elementId: endId } : null,
    }
  }

  // ── Pointer-move branch handlers ───────────────────────────────────────────

  function handleMovePointerMove(event: PointerEvent): boolean {
    const mv = moveState.value
    if (!mv) return false
    const zoom = store.viewport.zoom
    const dxScene = (event.clientX - mv.startScreenX) / zoom
    const dyScene = (event.clientY - mv.startScreenY) / zoom
    // Capture lazily on the first drag frame (not on pointerdown) so a bare
    // click / double-click is left intact for the native dblclick handler.
    capturePointerOnSvg(event.pointerId)
    // Push the pre-gesture snapshot exactly once, before the first mutation.
    pushGestureHistoryOnce()
    // Build all patches first, then apply in one batched call (FR-B8).
    const patches: Array<{ id: string; patch: ReturnType<typeof buildMovePatch> }> = []
    for (const id of mv.ids) {
      const original = mv.originalElements.get(id)
      if (original) {
        patches.push({ id, patch: buildMovePatch(original, dxScene, dyScene) })
      }
    }
    if (patches.length > 0) {
      // The store re-anchors bound connectors inside updateElements
      // (reanchorBoundConnectorsInPlace) whenever a bindable shape moves.
      store.updateElements(patches)
    }
    return true
  }

  function handleDrawPointerMove(event: PointerEvent): void {
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
      // In-place append on the array shared with previewPen — deep-ref
      // reactivity propagates the mutation without copying per move.
      state.points.push([pt.x, pt.y])
    }
  }

  // ── Pointer-up commit helpers ──────────────────────────────────────────────

  function commitShapeOnUp(event: PointerEvent): void {
    const state = drawState.value
    if (state.kind !== 'shape') return
    const pt = getScenePt(event)
    const style = { stroke: store.lastStroke, fill: store.lastFill, strokeWidth: store.lastStrokeWidth }
    const el = state.tool === 'rectangle'
      ? buildRectangleElement(state.ax, state.ay, pt.x, pt.y, style)
      : buildEllipseElement(state.ax, state.ay, pt.x, pt.y, style)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  }

  function commitLinearOnUp(event: PointerEvent): void {
    const state = drawState.value
    if (state.kind !== 'linear') return
    const { ax, ay, bx, by, startBinding, endBinding } = resolveLinearEndpoints(state, event)
    const style = { stroke: store.lastStroke, strokeWidth: store.lastStrokeWidth }
    const el = buildLinearElement(state.tool, ax, ay, bx, by, startBinding, endBinding, style)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  }

  function commitPenOnUp(): void {
    const state = drawState.value
    if (state.kind !== 'pen') return
    const style = { stroke: store.lastStroke, strokeWidth: store.lastStrokeWidth }
    const el = buildPenElement(state.points, style)
    if (el) store.addElement(el as DiagramElement)
    cancelDraw()
  }

  function commitMarqueeOnUp(): void {
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
  }

  function commitResizeOnUp(event: PointerEvent): void {
    const state = resizeState.value
    if (!state) return
    const result = commitResize(event.clientX, event.clientY)
    if (result) {
      const { patch, newBindings } = result
      if (newBindings) {
        store.updateElement(state.elementId, { ...patch, ...newBindings } as Partial<DiagramElement>)
      } else {
        store.updateElement(state.elementId, patch)
      }
    }
    endGestureHistory()
  }

  // ── Main event handlers ────────────────────────────────────────────────────

  // Seam for ICT-6/7: dispatches by tool to the appropriate handler.
  function onCanvasPointerDown(event: PointerEvent): void {
    // Defensive: if a previous gesture was never properly ended (e.g., pointer
    // released outside the browser window mid-resize), reset stale state so the
    // new interaction starts clean without inheriting stale geometry.
    if (isResizing.value) { cancelResize(); endGestureHistory() }
    if (moveState.value) { clearMove(); endGestureHistory() }
    if (marqueeIsActive.value) { cancelMarquee() }

    if (store.tool === 'hand') return handlePanPointerDown(event)
    if (store.tool === 'select') return handleSelectPointerDown(event)
    if (DRAWING_TOOLS.has(store.tool)) return handleDrawPointerDown(event)
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

    if (handleMovePointerMove(event)) return

    if (marqueeIsActive.value) {
      const pt = getScenePt(event)
      updateMarquee(pt.x, pt.y)
      return
    }

    handleDrawPointerMove(event)
  }

  function onCanvasPointerUp(event: PointerEvent): void {
    if (isPanning.value) {
      isPanning.value = false
      return
    }

    if (isResizing.value) {
      commitResizeOnUp(event)
      return
    }

    if (moveState.value) {
      // Final commit already applied via pointermove; just end the move.
      clearMove()
      endGestureHistory()
      return
    }

    if (marqueeIsActive.value) {
      commitMarqueeOnUp()
      return
    }

    const state = drawState.value
    if (state.kind === 'shape') { commitShapeOnUp(event); return }
    if (state.kind === 'linear') { commitLinearOnUp(event); return }
    if (state.kind === 'pen') { commitPenOnUp(); return }
    // text commits on blur/enter, not pointerup
  }

  function onCanvasPointerLeave(): void {
    // Only cancel pan; drawing uses pointer capture so leave won't fire mid-drag.
    if (isPanning.value) {
      isPanning.value = false
    }
  }

  function onCanvasPointerCancel(): void {
    cancelDraw()

    // Restore pre-gesture geometry so no half-dragged positions survive the cancel
    // (FR-A8 / FR-B2). We restore BEFORE clearing state because the state holds
    // the original snapshots we need.
    if (moveState.value) {
      for (const [id, original] of moveState.value.originalElements) {
        store.updateElement(id, original as Partial<DiagramElement>)
      }
    }
    if (resizeState.value) {
      const orig = resizeState.value.original
      store.updateElement(orig.id, orig as Partial<DiagramElement>)
    }

    // If a history snapshot was already pushed for this gesture, remove it — the
    // live elements are now identical to that snapshot so the entry is a no-op
    // duplicate. Discarding it ensures undo goes to the state BEFORE the gesture.
    if (gestureHistoryPushed.value) {
      store.discardLastHistory()
    }

    clearMove()
    cancelResize()
    cancelMarquee()
    isPanning.value = false
    endGestureHistory()
  }

  return {
    isPanning,
    beginGestureHistory,
    capturePointerOnSvg,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerLeave,
    onCanvasPointerCancel,
  }
}
