import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Diagram, DiagramElement, DiagramViewport } from '@tasknote/shared'
import { detachBindingsTo, elementCenter, findElementById, isBindableShape } from '../features/diagrams/connectors'
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
  const selectedId = ref<string | null>(null)
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
      retryAttempt = 0
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
   * Explicitly push a history snapshot of the current elements.
   * DiagramCanvas calls this at pointerdown (gesture start) so that the
   * continuous pointermove updates during drag/resize are captured as a
   * single undo entry rather than one per move event.
   */
  function pushHistory(): void {
    history.push(elements.value)
  }

  function addElement(el: DiagramElement): void {
    history.push(elements.value)
    elements.value = [...elements.value, el]
    scheduleSave()
  }

  function recomputeBoundConnectors(movedElementId: string): void {
    const movedShape = findElementById(elements.value, movedElementId)
    if (!movedShape) return

    const center = elementCenter(movedShape)

    elements.value = elements.value.map((el) => {
      if (el.type !== 'arrow' && el.type !== 'line') return el

      const matchesStart = el.startBinding?.elementId === movedElementId
      const matchesEnd = el.endBinding?.elementId === movedElementId
      if (!matchesStart && !matchesEnd) return el

      const start: [number, number] = matchesStart ? [center.x, center.y] : el.points[0]
      const end: [number, number] = matchesEnd ? [center.x, center.y] : el.points[1]
      return { ...el, points: [start, end] }
    })
  }

  function updateElement(elementId: string, patch: Partial<DiagramElement>): void {
    const idx = elements.value.findIndex((e) => e.id === elementId)
    if (idx === -1) return

    const current = elements.value[idx]!

    // When a user manually moves a connector (arrow/line), the drag produces a
    // `points` patch. That intent — "I placed this connector here" — must
    // override the binding: if bindings survived, recomputeBoundConnectors would
    // snap the arrow back to its bound shapes on the next shape move, undoing the
    // explicit repositioning. We therefore null both bindings in the same
    // mutation whenever a points-patch lands on a linear element that is still
    // bound. Style patches (stroke, strokeWidth, …) do NOT include `points` and
    // leave bindings intact, which is the correct narrow rule.
    const isLinear = current.type === 'arrow' || current.type === 'line'
    const hasPointsPatch = 'points' in patch
    const isBound =
      (current.type === 'arrow' || current.type === 'line') &&
      (current.startBinding != null || current.endBinding != null)

    const detachPatch: Partial<DiagramElement> =
      isLinear && hasPointsPatch && isBound
        ? { startBinding: null, endBinding: null }
        : {}

    const copy = [...elements.value]
    copy[idx] = { ...current, ...patch, ...detachPatch } as DiagramElement
    elements.value = copy

    const updatedElement = elements.value[idx]
    if (updatedElement && isBindableShape(updatedElement)) {
      recomputeBoundConnectors(elementId)
    }

    scheduleSave()
  }

  function removeElement(elementId: string): void {
    history.push(elements.value)
    const remaining = elements.value.filter((e) => e.id !== elementId)
    elements.value = detachBindingsTo(remaining, elementId)
    scheduleSave()
  }

  // ── History actions ──────────────────────────────────────────────────────────

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

  // ── Ephemeral UI mutations (do NOT save) ─────────────────────────────────────

  function selectElement(elementId: string | null): void {
    selectedId.value = elementId
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
    removeElement,
    pushHistory,
    undoAction,
    redoAction,
    canUndo,
    canRedo,
    selectElement,
    setTool,
    setViewport,
    setCanvasSize,
    // Transform helpers
    screenToScene,
    sceneToScreen,
  }
})
