import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  diagrams: {
    listDiagrams: vi.fn(),
    getDiagram: vi.fn(),
    createDiagram: vi.fn(),
    updateDiagram: vi.fn(),
    deleteDiagram: vi.fn(),
  },
}))

import { useDiagramsStore } from '@/stores/diagrams'
import * as api from '@/api'
import type { Diagram, DiagramElement, DiagramViewport } from '@tasknote/shared'

function makeDiagram(
  diagramId: number,
  diagramTitle: string,
  els: DiagramElement[] = [],
  vp: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 },
): Diagram {
  return {
    id: diagramId,
    title: diagramTitle,
    scene_json: {
      version: 1,
      elements: els,
      appState: { viewport: vp },
    },
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function makeRectangle(elId: string): DiagramElement {
  return {
    id: elId,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    stroke: '#000000',
    fill: null,
    strokeWidth: 1,
  }
}

describe('useDiagramsStore — debounced autosave', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('N mutations within the debounce window send exactly one PATCH', async () => {
    // Arrange: give the store a current diagram id so save() can fire
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    // Act: three addElement calls in rapid succession
    store.addElement(makeRectangle('el-1'))
    store.addElement(makeRectangle('el-2'))
    store.addElement(makeRectangle('el-3'))

    // Advance past the 600ms debounce window
    vi.advanceTimersByTime(700)

    // Assert: only one PATCH was scheduled and invoked
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
  })

  it('selecting an element does NOT schedule a save', () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    store.selectElement('el-1')
    vi.advanceTimersByTime(700)

    expect(api.diagrams.updateDiagram).not.toHaveBeenCalled()
  })

  it('changing tool does NOT schedule a save', () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    store.setTool('rectangle')
    vi.advanceTimersByTime(700)

    expect(api.diagrams.updateDiagram).not.toHaveBeenCalled()
  })
})

describe('useDiagramsStore — timer lifecycle (R2, R3)', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removeDiagram cancels a pending autosave for the open diagram (no PATCH to the deleted id)', async () => {
    // Arrange: diagram 1 is open
    const diagram1 = makeDiagram(1, 'Diagram One')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram1)
    vi.mocked(api.diagrams.deleteDiagram).mockResolvedValueOnce(undefined as unknown as void)
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(diagram1)

    await store.loadDiagram(1)

    // Act: add an element (schedules autosave) then delete the diagram
    store.addElement(makeRectangle('el-1'))
    await store.removeDiagram(1)

    // Advance past the debounce window — timer must be cancelled
    vi.advanceTimersByTime(700)

    expect(api.diagrams.updateDiagram).not.toHaveBeenCalled()
    expect(store.id).toBe(null)
  })

  it('loadDiagram flushes the previous diagram pending edit before switching', async () => {
    // Arrange: two diagrams
    const diagram1 = makeDiagram(1, 'Diagram One')
    const diagram2 = makeDiagram(2, 'Diagram Two')

    vi.mocked(api.diagrams.getDiagram).mockImplementation((diagramId: number) => {
      if (diagramId === 1) return Promise.resolve(diagram1)
      if (diagramId === 2) return Promise.resolve(diagram2)
      return Promise.reject(new Error('Not found'))
    })
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(diagram1)

    // Load diagram 1 and schedule a pending save
    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-a'))

    // Switch to diagram 2 — flush must fire the PATCH for diagram 1
    await store.loadDiagram(2)

    // Exactly one PATCH, targeting diagram 1
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
    expect(api.diagrams.updateDiagram).toHaveBeenCalledWith(1, expect.anything())

    // State now reflects diagram 2
    expect(store.id).toBe(2)
    expect(store.title).toBe('Diagram Two')

    // No additional PATCH fires after the debounce window
    vi.advanceTimersByTime(700)
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
  })

  it('loadDiagram proceeds even if the flush save rejects', async () => {
    const diagram1 = makeDiagram(1, 'Diagram One')
    const diagram2 = makeDiagram(2, 'Diagram Two')

    vi.mocked(api.diagrams.getDiagram).mockImplementation((diagramId: number) => {
      if (diagramId === 1) return Promise.resolve(diagram1)
      if (diagramId === 2) return Promise.resolve(diagram2)
      return Promise.reject(new Error('Not found'))
    })
    // The flush will call updateDiagram — make it reject
    vi.mocked(api.diagrams.updateDiagram).mockRejectedValueOnce(new Error('Network error'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-b'))

    // Should not throw; diagram 2 should load normally
    await expect(store.loadDiagram(2)).resolves.toBeUndefined()

    expect(api.diagrams.getDiagram).toHaveBeenCalledWith(2)
    expect(store.id).toBe(2)
    expect(store.title).toBe('Diagram Two')
  })
})

describe('useDiagramsStore — in-flight save epoch guard', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('an in-flight save whose diagram is deleted mid-await does not clear dirty for the new context', async () => {
    // Arrange: diagram 1 open and present in the list
    const diagram1 = makeDiagram(1, 'Diagram One')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram1)
    vi.mocked(api.diagrams.deleteDiagram).mockResolvedValueOnce(undefined as unknown as void)
    await store.loadDiagram(1)
    store.list = [diagram1]

    // updateDiagram resolves only when we say so — simulating an in-flight PATCH
    let resolveSave: (d: Diagram) => void = () => {}
    vi.mocked(api.diagrams.updateDiagram).mockImplementationOnce(
      () => new Promise<Diagram>((res) => { resolveSave = res }),
    )

    // Act: mutate (schedules), let the timer FIRE so save() is launched and now
    // awaiting the network; then delete the open diagram while it is in flight.
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700) // fires the timer → save() launched, awaiting
    await store.removeDiagram(1) // bumps epoch, nulls id, sets dirty=false

    // Re-establish a NEW editing context that is dirty (e.g. quickly opened a
    // fresh diagram and edited). If the stale save's `dirty=false` leaks through,
    // this dirty flag would be wrongly cleared.
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(makeDiagram(2, 'Diagram Two'))
    await store.loadDiagram(2)
    store.addElement(makeRectangle('el-new'))
    expect(store.dirty).toBe(true)

    // The stale diagram-1 PATCH finally resolves, after the epoch moved twice.
    resolveSave(makeDiagram(1, 'Stale Title'))
    await Promise.resolve()
    await Promise.resolve()

    // Guard holds: the stale save bailed before `dirty = false`, so the new
    // context's pending edit is still marked dirty. Without the epoch guard the
    // stale save would clear it.
    expect(store.dirty).toBe(true)
    // And it never re-inserted the deleted diagram.
    expect(store.list.find((d) => d.id === 1)).toBeUndefined()
  })

  it('an in-flight save whose diagram is switched mid-await does not overwrite the prior diagram list entry with stale data', async () => {
    const diagram1 = makeDiagram(1, 'Diagram One')
    const diagram2 = makeDiagram(2, 'Diagram Two')
    vi.mocked(api.diagrams.getDiagram).mockImplementation((diagramId: number) => {
      if (diagramId === 1) return Promise.resolve(diagram1)
      if (diagramId === 2) return Promise.resolve(diagram2)
      return Promise.reject(new Error('Not found'))
    })
    await store.loadDiagram(1)
    store.list = [diagram1, diagram2]

    // First updateDiagram (diagram 1's autosave) hangs; later saves resolve.
    let resolveStale: (d: Diagram) => void = () => {}
    vi.mocked(api.diagrams.updateDiagram)
      .mockImplementationOnce(() => new Promise<Diagram>((res) => { resolveStale = res }))
      .mockResolvedValue(diagram2)

    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700) // save() for diagram 1 launched, awaiting

    // Switch to diagram 2 (flushSave is a no-op: the timer already fired; load
    // bumps epoch and sets id=2).
    await store.loadDiagram(2)

    // The stale diagram-1 save resolves with a DIFFERENT title for id 1, after
    // the epoch moved. Without the guard, save() would patch list[id=1] with it.
    resolveStale(makeDiagram(1, 'STALE One'))
    await Promise.resolve()
    await Promise.resolve()

    // Guard holds: diagram 1's list entry keeps its original title (the stale
    // PATCH result was discarded).
    expect(store.id).toBe(2)
    expect(store.list.find((d) => d.id === 1)?.title).toBe('Diagram One')
  })
})

describe('useDiagramsStore — loadDiagram', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates elements and viewport from scene_json', async () => {
    const elements = [
      makeRectangle('a'),
      makeRectangle('b'),
      makeRectangle('c'),
      makeRectangle('d'),
      makeRectangle('e'),
    ]
    const vp: DiagramViewport = { scrollX: 200, scrollY: 100, zoom: 1.5 }
    const diagram = makeDiagram(7, 'Canvas', elements, vp)

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(7)

    expect(store.elements).toHaveLength(5)
    expect(store.viewport.scrollX).toBe(200)
    expect(store.viewport.scrollY).toBe(100)
    expect(store.viewport.zoom).toBe(1.5)
    expect(store.dirty).toBe(false)
  })

  it('load failure sets error flag and leaves elements empty', async () => {
    vi.mocked(api.diagrams.getDiagram).mockRejectedValueOnce(new Error('Not found'))

    await store.loadDiagram(999)

    expect(store.error).toBe('Not found')
    expect(store.elements).toHaveLength(0)
  })
})
