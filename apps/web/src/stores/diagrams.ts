import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Diagram, DiagramElement, DiagramViewport } from '@tasknote/shared'
import { detachBindingsTo, elementCenter, isBindableShape, boundEndpoint } from '../features/diagrams/connectors'
import { useHistory } from '../features/diagrams/useHistory'

const DEBOUNCE_MS = 600

// Retry backoff schedule in milliseconds: 2s → 5s → 15s, then every 15s.
const RETRY_DELAYS_MS = [2000, 5000, 15000]
const RETRY_STEADY_MS = 15000

// ─── Coordinate transforms ────────────────────────────────────────────────────

/** Convert a screen-space point to scene-space using the current viewport. */
export function screenToScene(
  point: { x: number; y: number },
  viewport: DiagramViewport,
): { x: number; y: number } {
  return {
    x: point.x / viewport.zoom - viewport.scrollX,
    y: point.y / viewport.zoom - viewport.scrollY,
  }
}

/** Convert a scene-space point to screen-space using the current viewport. */
export function sceneToScreen(
  point: { x: number; y: number },
  viewport: DiagramViewport,
): { x: number; y: number } {
  return {
    x: (point.x + viewport.scrollX) * viewport.zoom,
    y: (point.y + viewport.scrollY) * viewport.zoom,
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useDiagramsStore = defineStore('diagrams', () => {
  // ── List state ──────────────────────────────────────────────────────────────
  const list = ref<Diagram[]>([])
  const loading = ref(false)
  const listError = ref<string | null>(null)

  // ── Editor state ────────────────────────────────────────────────────────────
  const id = ref<number | null>(null)
  const title = ref('')
  const elements = ref<DiagramElement[]>([])
  const viewport = ref<DiagramViewport>({ scrollX: 0, scrollY: 0, zoom: 1 })
  const canvasSize = ref<{ width: number; height: number }>({ width: 0, height: 0 })
  const tool = ref<string>('select')
  const selectedIds = ref<string[]>([])
  // Backward-compat helper: first selected id, or null when nothing is selected.
  const selectedId = computed<string | null>(() => selectedIds.value[0] ?? null)
  const dirty = ref(false)
  const saving = ref(false)
  const loadError = ref<string | null>(null)
  const saveError = ref<string | null>(null)

  // ── History (undo/redo) ──────────────────────────────────────────────────────

  const history = useHistory(() => elements.value)

  const canUndo = computed(() => history.canUndo.value)
  const canRedo = computed(() => history.canRedo.value)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryAttempt = 0

  // Generation token: bumped whenever the open diagram changes (load) or is
  // deleted. An in-flight save() captures the epoch before its network await
  // and bails out of the list-patch / dirty-clear if the epoch moved during
  // the await — so a save launched against a now-stale diagram can never write
  // back. Guarantees "no stale write" without relying on incidental ordering.
  let epoch = 0

  // ── List actions ────────────────────────────────────────────────────────────

  async function loadList(): Promise<void> {
    loading.value = true
    listError.value = null
    try {
      list.value = await api.diagrams.listDiagrams()
    } catch (err) {
      listError.value = err instanceof Error ? err.message : 'Failed to load diagrams'
    } finally {
      loading.value = false
    }
  }

  async function createDiagram(newTitle?: string): Promise<Diagram> {
    listError.value = null
    try {
      const diagram = await api.diagrams.createDiagram(
        newTitle !== undefined ? { title: newTitle } : {},
      )
      list.value = [diagram, ...list.value]
      return diagram
    } catch (err) {
      listError.value = err instanceof Error ? err.message : 'Failed to create diagram'
      throw err
    }
  }

  async function renameDiagram(diagramId: number, newTitle: string): Promise<void> {
    listError.value = null
    try {
      const updated = await api.diagrams.updateDiagram(diagramId, { title: newTitle })
      const idx = list.value.findIndex((d) => d.id === diagramId)
      if (idx !== -1) {
        const copy = [...list.value]
        copy[idx] = updated
        list.value = copy
      }
      if (id.value === diagramId) {
        title.value = updated.title
      }
    } catch (err) {
      listError.value = err instanceof Error ? err.message : 'Failed to rename diagram'
      throw err
    }
  }

  async function removeDiagram(diagramId: number): Promise<void> {
    listError.value = null
    if (diagramId === id.value) {
      cancelScheduledSave()
      cancelRetry()
      id.value = null
      epoch += 1
    }
    try {
      await api.diagrams.deleteDiagram(diagramId)
      list.value = list.value.filter((d) => d.id !== diagramId)
    } catch (err) {
      listError.value = err instanceof Error ? err.message : 'Failed to delete diagram'
      throw err
    }
  }

  // ── Editor actions ──────────────────────────────────────────────────────────

  async function loadDiagram(diagramId: number): Promise<void> {
    try {
      await flushSave()
    } catch {
      // best-effort: do not block navigation if flush fails
    }
    cancelRetry()
    loading.value = true
    loadError.value = null
    try {
      const diagram = await api.diagrams.getDiagram(diagramId)
      epoch += 1
      id.value = diagram.id
      title.value = diagram.title
      elements.value = diagram.scene_json.elements
      viewport.value = diagram.scene_json.appState.viewport
      dirty.value = false
      saveError.value = null
      history.clear()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load diagram'
      elements.value = []
    } finally {
      loading.value = false
    }
  }

  async function save(): Promise<void> {
    if (id.value === null) return

    const myEpoch = epoch
    saving.value = true
    try {
      const updated = await api.diagrams.updateDiagram(id.value, {
        title: title.value,
        scene_json: {
          version: 1,
          elements: elements.value,
          appState: { viewport: viewport.value },
        },
      })
      // The open diagram changed (switched/deleted) while this save was in
      // flight — discard its result so it cannot write back stale state.
      if (myEpoch !== epoch) return
      dirty.value = false
      saveError.value = null
      cancelRetry()
      // Patch list if the diagram is visible there
      const idx = list.value.findIndex((d) => d.id === updated.id)
      if (idx !== -1) {
        const copy = [...list.value]
        copy[idx] = updated
        list.value = copy
      }
    } catch (err) {
      if (myEpoch !== epoch) return
      saveError.value = err instanceof Error ? err.message : 'Failed to save diagram'
      scheduleRetry(myEpoch)
    } finally {
      saving.value = false
    }
  }

  function cancelRetry(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    retryAttempt = 0
  }

  function scheduleRetry(forEpoch: number): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const delay = RETRY_DELAYS_MS[retryAttempt] ?? RETRY_STEADY_MS
    retryAttempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      // Epoch moved while we were waiting — abort this retry chain
      if (epoch !== forEpoch) return
      void save()
    }, delay)
  }

  function cancelScheduledSave(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    cancelRetry()
    dirty.value = false
  }

  async function flushSave(): Promise<void> {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (dirty.value) {
      await save()
    }
  }

  function scheduleSave(): void {
    dirty.value = true

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      save()
    }, DEBOUNCE_MS)
  }

  // ── Element mutations ────────────────────────────────────────────────────────

  /**
   * Explicitly push a history snapshot.
   * Pass an explicit snapshot (pre-gesture elements) to record that state.
   * When no snapshot is provided, the CURRENT elements are snapshotted —
   * this preserves existing callers (applyStyle, etc.) that call pushHistory()
   * immediately before mutating.
   */
  function pushHistory(snapshot?: DiagramElement[]): void {
    history.push(snapshot ?? elements.value)
  }

  function addElement(el: DiagramElement): void {
    history.push(elements.value)
    elements.value = [...elements.value, el]
    scheduleSave()
  }

  /**
   * Re-anchor bound connectors against moved shapes, mutating `arr` IN PLACE.
   * Both-ends-bound semantics (FR-B5/FR-B3) preserved: when both ends bind to
   * different shapes, both endpoints re-anchor along the center-to-center ray.
   *
   * Hot-path helper: callers own a fresh array copy and assign it to
   * `elements.value` themselves, so a gesture costs ONE array copy total
   * (updateElements' map) instead of two. Lookups go through a prebuilt
   * id→element Map instead of repeated O(n) findElementById scans.
   */
  function reanchorBoundConnectorsInPlace(
    arr: DiagramElement[],
    movedShapeIds: Set<string>,
  ): void {
    if (movedShapeIds.size === 0) return

    const byId = new Map<string, DiagramElement>()
    for (const el of arr) byId.set(el.id, el)

    for (let i = 0; i < arr.length; i++) {
      const el = arr[i]!
      if (el.type !== 'arrow' && el.type !== 'line') continue

      const startShapeId = el.startBinding?.elementId
      const endShapeId = el.endBinding?.elementId
      const matchesStart = startShapeId != null && movedShapeIds.has(startShapeId)
      const matchesEnd = endShapeId != null && movedShapeIds.has(endShapeId)
      if (!matchesStart && !matchesEnd) continue

      // Resolve the concrete moved shape for each bound end.
      const startShape = matchesStart ? byId.get(startShapeId!) : undefined
      const endShape = matchesEnd ? byId.get(endShapeId!) : undefined

      let start: [number, number]
      let end: [number, number]

      if (matchesStart && matchesEnd && startShape && endShape) {
        if (startShapeId === endShapeId) {
          // Self-loop: both ends on the same shape — fall back to center.
          const center = elementCenter(startShape)
          start = [center.x, center.y]
          end = [center.x, center.y]
        } else {
          // Both ends bound to different moved shapes — recompute both along the
          // new center-to-center ray.
          const startCenter = elementCenter(startShape)
          const endCenter = elementCenter(endShape)
          const startPt = boundEndpoint(startShape, endCenter)
          const endPt = boundEndpoint(endShape, startCenter)
          start = [startPt.x, startPt.y]
          end = [endPt.x, endPt.y]
        }
      } else if (matchesStart && startShape) {
        // Start is bound to a moved shape; end is either free or bound to an
        // unmoved shape.
        const otherEndId = el.endBinding?.elementId
        const otherEl = otherEndId ? byId.get(otherEndId) : undefined
        const from = otherEl ? elementCenter(otherEl) : { x: el.points[1][0], y: el.points[1][1] }
        const pt = boundEndpoint(startShape, from)
        start = [pt.x, pt.y]
        if (otherEl) {
          // Both ends bound to different shapes (other end unmoved) — recompute
          // end against startShape's new center (FR-B5/FR-B3).
          const endPt = boundEndpoint(otherEl, elementCenter(startShape))
          end = [endPt.x, endPt.y]
        } else {
          end = el.points[1]
        }
      } else if (matchesEnd && endShape) {
        // End is bound to a moved shape; start is either free or bound to an
        // unmoved shape.
        const otherStartId = el.startBinding?.elementId
        const otherEl = otherStartId ? byId.get(otherStartId) : undefined
        const from = otherEl ? elementCenter(otherEl) : { x: el.points[0][0], y: el.points[0][1] }
        const pt = boundEndpoint(endShape, from)
        end = [pt.x, pt.y]
        if (otherEl) {
          // Both ends bound to different shapes (other end unmoved) — recompute
          // start against endShape's new center (FR-B5/FR-B3).
          const startPt = boundEndpoint(otherEl, elementCenter(endShape))
          start = [startPt.x, startPt.y]
        } else {
          start = el.points[0]
        }
      } else {
        continue
      }

      arr[i] = { ...el, points: [start, end] } as DiagramElement
    }
  }

  /**
   * Standalone recompute — copies the array once, re-anchors in place, assigns.
   * Hot paths (updateElements) skip this wrapper and re-anchor their own copy.
   */
  function recomputeBoundConnectorsForSet(movedShapeIds: Set<string>): void {
    if (movedShapeIds.size === 0) return
    const next = [...elements.value]
    reanchorBoundConnectorsInPlace(next, movedShapeIds)
    elements.value = next
  }

  /** Thin single-shape wrapper — preserves the existing call signature. */
  function recomputeBoundConnectors(movedElementId: string): void {
    recomputeBoundConnectorsForSet(new Set([movedElementId]))
  }

  /**
   * Apply a batch of patches in a single array copy.
   *
   * - Builds a Map<id, patch> from the input.
   * - Maps over elements.value ONCE, applying each patch inline.
   * - Per-element connector-detach guard (ICT-3/ICT-2 era) runs per patched
   *   element identically to updateElement.
   * - After the single copy, runs recomputeBoundConnectorsForSet ONCE for all
   *   affected bindable shapes — O(n) connector scan regardless of batch size.
   * - Calls scheduleSave() exactly once.
   *
   * Does NOT push history — callers are responsible for their own push semantics.
   */
  function updateElements(patches: Array<{ id: string; patch: Partial<DiagramElement> }>): void {
    if (patches.length === 0) return

    const patchMap = new Map<string, Partial<DiagramElement>>()
    for (const { id: elId, patch } of patches) {
      patchMap.set(elId, patch)
    }

    const bindableShapesMoved = new Set<string>()

    const next = elements.value.map((el) => {
      const patch = patchMap.get(el.id)
      if (!patch) return el

      // Connector-detach guard: identical logic to updateElement.
      const isLinear = el.type === 'arrow' || el.type === 'line'
      const hasPointsPatch = 'points' in patch
      const isBound =
        (el.type === 'arrow' || el.type === 'line') &&
        (el.startBinding != null || el.endBinding != null)
      const hasBindingPatch = 'startBinding' in patch || 'endBinding' in patch
      const detachPatch: Partial<DiagramElement> =
        isLinear && hasPointsPatch && isBound && !hasBindingPatch
          ? { startBinding: null, endBinding: null }
          : {}

      const updated = { ...el, ...patch, ...detachPatch } as DiagramElement

      if (isBindableShape(updated)) {
        bindableShapesMoved.add(el.id)
      }

      return updated
    })

    // Re-anchor connectors on the same fresh copy, then assign ONCE — a drag
    // frame costs one array copy and one reactive assignment, not two.
    reanchorBoundConnectorsInPlace(next, bindableShapesMoved)
    elements.value = next

    scheduleSave()
  }

  function updateElement(elementId: string, patch: Partial<DiagramElement>): void {
    updateElements([{ id: elementId, patch }])
  }

  function removeElements(ids: string[]): void {
    if (ids.length === 0) return
    history.push(elements.value)
    let remaining = elements.value.filter((e) => !ids.includes(e.id))
    for (const id of ids) {
      remaining = detachBindingsTo(remaining, id)
    }
    elements.value = remaining
    scheduleSave()
  }

  function removeElement(elementId: string): void {
    removeElements([elementId])
  }

  // ── History actions ──────────────────────────────────────────────────────────

  /**
   * Remove the most recent undo entry without affecting redo.
   * Called by DiagramCanvas after a pointer-cancel restores original geometry —
   * the pushed snapshot now duplicates the live state and would be a no-op undo.
   */
  function discardLastHistory(): void {
    history.discardLast()
  }

  function undoAction(): void {
    const restored = history.undo()
    if (restored !== null) {
      elements.value = restored
      scheduleSave()
    }
  }

  function redoAction(): void {
    const restored = history.redo()
    if (restored !== null) {
      elements.value = restored
      scheduleSave()
    }
  }

  // ── Style: last-used defaults for new elements ───────────────────────────────

  const lastStroke = ref<string>('currentColor')
  const lastFill = ref<string | null>(null)
  const lastStrokeWidth = ref<number>(2)
  const lastFontSize = ref<number>(16)

  // ── Style action ─────────────────────────────────────────────────────────────

  type StylePatch = { stroke?: string; fill?: string | null; strokeWidth?: number; fontSize?: number }
  type FlatElPatch = { stroke?: string; color?: string; fill?: string | null; strokeWidth?: number; fontSize?: number }

  /**
   * Translate a generic style patch into the concrete fields for one element.
   * - stroke → `color` on text, `stroke` on everything else
   * - fill → `fill` on rect/ellipse only
   * - strokeWidth → all except text
   * - fontSize → text only
   * Returns null when no valid fields apply to this element type.
   */
  function buildElementStylePatch(el: DiagramElement, patch: StylePatch): FlatElPatch | null {
    const elPatch: FlatElPatch = {}

    if (patch.stroke !== undefined) {
      if (el.type === 'text') {
        elPatch.color = patch.stroke
      } else {
        elPatch.stroke = patch.stroke
      }
    }

    if (patch.fill !== undefined) {
      if (el.type === 'rectangle' || el.type === 'ellipse') {
        elPatch.fill = patch.fill
      }
    }

    if (patch.strokeWidth !== undefined) {
      if (el.type !== 'text') {
        elPatch.strokeWidth = patch.strokeWidth
      }
    }

    if (patch.fontSize !== undefined) {
      if (el.type === 'text') {
        elPatch.fontSize = patch.fontSize
      }
    }

    return Object.keys(elPatch).length > 0 ? elPatch : null
  }

  /**
   * Apply a style patch to every currently selected element in one undo entry.
   * One pushHistory() call before the loop makes the entire batch a single undo
   * step. updateElements() makes ONE array copy and ONE scheduleSave() call.
   */
  function applyStyle(patch: StylePatch): void {
    if (selectedIds.value.length === 0) return

    pushHistory()

    // Build a patches array so updateElements makes ONE array copy and ONE
    // scheduleSave() call for the entire style batch (FR-B8).
    const patches: Array<{ id: string; patch: Partial<DiagramElement> }> = []

    for (const elId of selectedIds.value) {
      const el = elements.value.find((e) => e.id === elId)
      if (!el) continue
      const elPatch = buildElementStylePatch(el, patch)
      if (elPatch) {
        patches.push({ id: elId, patch: elPatch as Partial<DiagramElement> })
      }
    }

    if (patches.length > 0) {
      updateElements(patches)
    }

    // Update last-used style memory
    if (patch.stroke !== undefined) lastStroke.value = patch.stroke
    if (patch.fill !== undefined) lastFill.value = patch.fill
    if (patch.strokeWidth !== undefined) lastStrokeWidth.value = patch.strokeWidth
    if (patch.fontSize !== undefined) lastFontSize.value = patch.fontSize
  }

  // ── Ephemeral UI mutations (do NOT save) ─────────────────────────────────────

  function selectElement(elementId: string | null, additive = false): void {
    if (elementId === null) {
      selectedIds.value = []
      return
    }
    if (additive) {
      const idx = selectedIds.value.indexOf(elementId)
      if (idx === -1) {
        selectedIds.value = [...selectedIds.value, elementId]
      } else {
        selectedIds.value = selectedIds.value.filter((id) => id !== elementId)
      }
    } else {
      selectedIds.value = [elementId]
    }
  }

  function setTool(t: string): void {
    tool.value = t
  }

  function setViewport(v: DiagramViewport): void {
    viewport.value = v
    scheduleSave()
  }

  function setCanvasSize(width: number, height: number): void {
    canvasSize.value = { width, height }
  }

  return {
    // List
    list,
    loading,
    listError,
    loadList,
    createDiagram,
    renameDiagram,
    removeDiagram,
    // Editor
    id,
    title,
    elements,
    viewport,
    canvasSize,
    tool,
    selectedId,
    selectedIds,
    dirty,
    saving,
    loadError,
    saveError,
    loadDiagram,
    save,
    scheduleSave,
    cancelScheduledSave,
    flushSave,
    addElement,
    updateElement,
    updateElements,
    removeElement,
    removeElements,
    pushHistory,
    discardLastHistory,
    undoAction,
    redoAction,
    canUndo,
    canRedo,
    applyStyle,
    lastStroke,
    lastFill,
    lastStrokeWidth,
    lastFontSize,
    selectElement,
    setTool,
    setViewport,
    setCanvasSize,
    // Transform helpers
    screenToScene,
    sceneToScreen,
  }
})
