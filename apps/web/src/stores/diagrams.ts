import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Diagram, DiagramElement, DiagramViewport } from '@tasknote/shared'

const DEBOUNCE_MS = 600

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
  const error = ref<string | null>(null)

  // ── Editor state ────────────────────────────────────────────────────────────
  const id = ref<number | null>(null)
  const title = ref('')
  const elements = ref<DiagramElement[]>([])
  const viewport = ref<DiagramViewport>({ scrollX: 0, scrollY: 0, zoom: 1 })
  const tool = ref<string>('select')
  const selectedId = ref<string | null>(null)
  const dirty = ref(false)
  const saving = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ── List actions ────────────────────────────────────────────────────────────

  async function loadList(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      list.value = await api.diagrams.listDiagrams()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load diagrams'
    } finally {
      loading.value = false
    }
  }

  async function createDiagram(newTitle?: string): Promise<Diagram> {
    error.value = null
    try {
      const diagram = await api.diagrams.createDiagram(
        newTitle !== undefined ? { title: newTitle } : {},
      )
      list.value = [diagram, ...list.value]
      return diagram
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create diagram'
      throw err
    }
  }

  async function renameDiagram(diagramId: number, newTitle: string): Promise<void> {
    error.value = null
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
      error.value = err instanceof Error ? err.message : 'Failed to rename diagram'
      throw err
    }
  }

  async function removeDiagram(diagramId: number): Promise<void> {
    error.value = null
    try {
      await api.diagrams.deleteDiagram(diagramId)
      list.value = list.value.filter((d) => d.id !== diagramId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete diagram'
      throw err
    }
  }

  // ── Editor actions ──────────────────────────────────────────────────────────

  async function loadDiagram(diagramId: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const diagram = await api.diagrams.getDiagram(diagramId)
      id.value = diagram.id
      title.value = diagram.title
      elements.value = diagram.scene_json.elements
      viewport.value = diagram.scene_json.appState.viewport
      dirty.value = false
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load diagram'
      elements.value = []
    } finally {
      loading.value = false
    }
  }

  async function save(): Promise<void> {
    if (id.value === null) return

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
      dirty.value = false
      // Patch list if the diagram is visible there
      const idx = list.value.findIndex((d) => d.id === updated.id)
      if (idx !== -1) {
        const copy = [...list.value]
        copy[idx] = updated
        list.value = copy
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save diagram'
    } finally {
      saving.value = false
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

  function addElement(el: DiagramElement): void {
    elements.value = [...elements.value, el]
    scheduleSave()
  }

  function updateElement(elementId: string, patch: Partial<DiagramElement>): void {
    const idx = elements.value.findIndex((e) => e.id === elementId)
    if (idx === -1) return
    const copy = [...elements.value]
    copy[idx] = { ...copy[idx], ...patch } as DiagramElement
    elements.value = copy
    scheduleSave()
  }

  function removeElement(elementId: string): void {
    elements.value = elements.value.filter((e) => e.id !== elementId)
    scheduleSave()
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

  return {
    // List
    list,
    loading,
    error,
    loadList,
    createDiagram,
    renameDiagram,
    removeDiagram,
    // Editor
    id,
    title,
    elements,
    viewport,
    tool,
    selectedId,
    dirty,
    saving,
    loadDiagram,
    save,
    scheduleSave,
    addElement,
    updateElement,
    removeElement,
    selectElement,
    setTool,
    setViewport,
    // Transform helpers
    screenToScene,
    sceneToScreen,
  }
})
