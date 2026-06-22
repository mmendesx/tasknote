import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Diagram, DiagramElement, DiagramViewport } from '@tasknote/shared'
import { detachBindingsTo, elementCenter, isBindableShape } from '../features/diagrams/connectors'
import { facingSideAnchor, facingSide, autoWaypoints, chooseConnectorSides, anchorForSide } from '../features/diagrams/orthogonalRoute'
import type { Side } from '../features/diagrams/orthogonalRoute'
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

  // Scene-change generation counters (delta saves). sceneGen bumps on every
  // scene-mutating scheduleSave; savedSceneGen records the last generation
  // persisted. Equal ⇒ only the viewport can be stale ⇒ save() sends the
  // ~80-byte viewport-only PATCH instead of the full element array.
  let sceneGen = 0
  let savedSceneGen = 0

  // ── List actions ────────────────────────────────────────────────────────────

  // Abort the previous in-flight read when a new one starts: a superseded
  // response must neither write state nor clobber the newer call's
  // loading/error flags (identity check in finally).
  let listAbort: AbortController | null = null

  async function loadList(): Promise<void> {
    listAbort?.abort()
    const ctrl = new AbortController()
    listAbort = ctrl
    loading.value = true
    listError.value = null
    try {
      list.value = await api.diagrams.listDiagrams(ctrl.signal)
    } catch (err) {
      if (ctrl.signal.aborted) return
      listError.value = err instanceof Error ? err.message : 'Failed to load diagrams'
    } finally {
      if (listAbort === ctrl) {
        loading.value = false
        listAbort = null
      }
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

  /**
   * Compute the auto-route for a single connector element.
   *
   * Shared by normalizeLegacyConnectorRoutes (load-time) and resetConnectorRoute
   * (user gesture). Does NOT check routeMode or waypoints presence — callers are
   * responsible for those guards; this function always overwrites with auto route.
   *
   * - Both-bound, different shapes: recompute anchors + sides → autoWaypoints.
   * - Self-loop, one-bound, unbound, or missing shape: set waypoints:[], routeMode:'auto'.
   */
  function computeAutoRoute(
    el: DiagramElement,
    byId: Map<string, DiagramElement>,
  ): DiagramElement {
    const startId = (el as any).startBinding?.elementId as string | undefined
    const endId = (el as any).endBinding?.elementId as string | undefined
    const startShape = startId ? byId.get(startId) : undefined
    const endShape = endId ? byId.get(endId) : undefined

    const isBothBound = startShape != null && endShape != null
    if (isBothBound && startId !== endId) {
      const { startSide, endSide } = chooseConnectorSides(startShape!, endShape!)
      const start = anchorForSide(startShape!, startSide)
      const end = anchorForSide(endShape!, endSide)
      const waypoints = autoWaypoints(start, startSide, end, endSide)
      return { ...el, points: [start, end], waypoints, routeMode: 'auto' } as unknown as DiagramElement
    }

    // Self-loop, one-bound, unbound, or missing shape: mark normalized, no elbow.
    return { ...el, waypoints: [], routeMode: 'auto' } as unknown as DiagramElement
  }

  /**
   * Normalize legacy spec-20 scenes at load time so the spec-21 renderer's
   * [start, ...waypoints, end] path works correctly.
   *
   * spec-20 stored bound connectors WITHOUT `waypoints` (the elbow was derived
   * at render). spec-21 render reads `waypoints` directly, so missing waypoints
   * would produce a straight diagonal. This function adds them once on load.
   *
   * Rules:
   * - Skip if routeMode === 'manual' (user route — never touch).
   * - Skip if waypoints is already present (non-undefined, even []) — spec-21 saved it.
   * - Both-bound, different shapes: recompute anchors + sides → autoWaypoints.
   * - One-bound, unbound, self-loop, or missing shape: set waypoints:[], routeMode:'auto'.
   */
  function normalizeLegacyConnectorRoutes(els: DiagramElement[]): DiagramElement[] {
    const byId = new Map<string, DiagramElement>()
    for (const el of els) byId.set(el.id, el)

    return els.map((el) => {
      if (el.type !== 'arrow' && el.type !== 'line') return el
      if ((el as any).routeMode === 'manual') return el
      // ponytail: presence check uses !== undefined so waypoints:[] (spec-21 aligned route)
      // is treated as already-normalized and skipped.
      if ((el as any).waypoints !== undefined) return el

      // Legacy auto connector with no waypoints — delegate to shared helper.
      return computeAutoRoute(el, byId)
    })
  }

  /**
   * Reset a connector to auto-route mode.
   *
   * Called when the user double-clicks a line or arrow (spec-21/ICT-7).
   * Clears manual waypoints, recomputes anchors + sides for both-bound connectors,
   * and sets routeMode:'auto'. One history entry is recorded.
   *
   * Bypasses updateElement's detach guard (which would null out bindings whenever
   * points are patched on a bound connector) by assigning elements.value directly.
   */
  function resetConnectorRoute(connectorId: string): void {
    const el = elements.value.find((e) => e.id === connectorId)
    if (!el || (el.type !== 'arrow' && el.type !== 'line')) return

    pushHistory()

    const byId = new Map<string, DiagramElement>()
    for (const e of elements.value) byId.set(e.id, e)

    elements.value = elements.value.map((e) =>
      e.id === connectorId ? computeAutoRoute(e, byId) : e,
    )
    scheduleSave()
  }

  let loadDiagramAbort: AbortController | null = null

  async function loadDiagram(diagramId: number): Promise<void> {
    loadDiagramAbort?.abort()
    const ctrl = new AbortController()
    loadDiagramAbort = ctrl
    try {
      await flushSave()
    } catch {
      // best-effort: do not block navigation if flush fails
    }
    cancelRetry()
    loading.value = true
    loadError.value = null
    try {
      const diagram = await api.diagrams.getDiagram(diagramId, ctrl.signal)
      epoch += 1
      id.value = diagram.id
      title.value = diagram.title
      elements.value = normalizeLegacyConnectorRoutes(diagram.scene_json.elements)
      viewport.value = diagram.scene_json.appState.viewport
      dirty.value = false
      sceneGen = 0
      savedSceneGen = 0
      saveError.value = null
      history.clear()
    } catch (err) {
      if (ctrl.signal.aborted) return
      loadError.value = err instanceof Error ? err.message : 'Failed to load diagram'
      elements.value = []
    } finally {
      if (loadDiagramAbort === ctrl) {
        loading.value = false
        loadDiagramAbort = null
      }
    }
  }

  async function save(): Promise<void> {
    if (id.value === null) return

    const myEpoch = epoch
    // Generation snapshot BEFORE the await: a scene edit landing mid-save
    // bumps sceneGen past this snapshot, so completion can't mark it saved
    // and the follow-up save still sends the full scene.
    const genAtStart = sceneGen
    const savingScene = genAtStart !== savedSceneGen
    saving.value = true
    try {
      // Delta save: pan/zoom-only changes send just the viewport (~80 bytes)
      // instead of serializing and uploading the entire element array.
      const updated = await api.diagrams.updateDiagram(
        id.value,
        savingScene
          ? {
              title: title.value,
              scene_json: {
                version: 1,
                elements: elements.value,
                appState: { viewport: viewport.value },
              },
            }
          : { viewport: viewport.value },
      )
      // The open diagram changed (switched/deleted) while this save was in
      // flight — discard its result so it cannot write back stale state.
      if (myEpoch !== epoch) return
      dirty.value = false
      savedSceneGen = genAtStart
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
    savedSceneGen = sceneGen
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

  function scheduleSave(opts?: { sceneChanged?: boolean }): void {
    dirty.value = true
    if (opts?.sceneChanged !== false) sceneGen += 1

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
      let startSide: Side | undefined
      let endSide: Side | undefined

      if (matchesStart && matchesEnd && startShape && endShape) {
        if (startShapeId === endShapeId) {
          // Self-loop: both ends on the same shape — fall back to center.
          const center = elementCenter(startShape)
          start = [center.x, center.y]
          end = [center.x, center.y]
          // startSide/endSide left undefined: no waypoints for self-loop.
        } else {
          // Both ends bound to different moved shapes — pick sides by clearance
          // (roomier axis), then anchor each end on the chosen side so anchor and
          // side never disagree.
          const sides = chooseConnectorSides(startShape, endShape)
          startSide = sides.startSide
          endSide = sides.endSide
          start = anchorForSide(startShape, startSide)
          end = anchorForSide(endShape, endSide)
        }
      } else if (matchesStart && startShape) {
        // Start is bound to a moved shape; end is either free or bound to an
        // unmoved shape.
        const otherEndId = el.endBinding?.elementId
        const otherEl = otherEndId ? byId.get(otherEndId) : undefined
        if (otherEl) {
          // Both ends bound to different shapes — choose sides by clearance.
          const sides = chooseConnectorSides(startShape, otherEl)
          startSide = sides.startSide
          endSide = sides.endSide
          start = anchorForSide(startShape, startSide)
          end = anchorForSide(otherEl, endSide)
        } else {
          // Free other end: anchor the moved start toward the free point.
          const startToward: [number, number] = [el.points[1][0], el.points[1][1]]
          start = facingSideAnchor(startShape, startToward)
          startSide = facingSide(startShape, startToward)
          end = el.points[1]
          // endSide left undefined: free end, no side known.
        }
      } else if (matchesEnd && endShape) {
        // End is bound to a moved shape; start is either free or bound to an
        // unmoved shape.
        const otherStartId = el.startBinding?.elementId
        const otherEl = otherStartId ? byId.get(otherStartId) : undefined
        if (otherEl) {
          // Both ends bound to different shapes — choose sides by clearance.
          const sides = chooseConnectorSides(otherEl, endShape)
          startSide = sides.startSide
          endSide = sides.endSide
          start = anchorForSide(otherEl, startSide)
          end = anchorForSide(endShape, endSide)
        } else {
          // Free other end: anchor the moved end toward the free point.
          const endToward: [number, number] = [el.points[0][0], el.points[0][1]]
          end = facingSideAnchor(endShape, endToward)
          endSide = facingSide(endShape, endToward)
          start = el.points[0]
          // startSide left undefined: free end, no side known.
        }
      } else {
        continue
      }

      // Moving a bound shape re-routes the connector to a clean side-aware auto
      // path. Manual (hand-dragged) connectors revert to auto on move: preserving
      // hand-drawn bends across a move needs storing user bends separately from
      // generated legs (indistinguishable in `waypoints` today) — a data-model
      // change tracked as a spec-21 follow-up. Reverting keeps every re-anchored
      // route orthogonal and bounded (no stale-leg diagonals, no per-frame pile-up).
      // ponytail: revert-to-auto over leg-preservation deletes a whole bug class.
      const waypoints: [number, number][] = startSide && endSide ? autoWaypoints(start, startSide, end, endSide) : []
      arr[i] = { ...el, points: [start, end], waypoints, routeMode: 'auto' } as unknown as DiagramElement
    }
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
    // Pan/zoom never changes elements — let save() take the viewport-only path.
    scheduleSave({ sceneChanged: false })
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
    resetConnectorRoute,
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
