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
import {
  autoWaypoints,
  facingSide,
  facingSideAnchor,
  composeManualRoute,
  chooseConnectorSides,
  anchorForSide,
} from '@/features/diagrams/orthogonalRoute'
import { elementCenter } from '@/features/diagrams/connectors'

// makeRectangle width=100, height=50 → center = (x+50, y+25)
// For center (100,100): x=50, y=75
// For center (180,140): x=130, y=115
function makeRectangleAt(elId: string, x: number, y: number): DiagramElement {
  return {
    id: elId,
    type: 'rectangle',
    x,
    y,
    width: 100,
    height: 50,
    stroke: '#000000',
    fill: null,
    strokeWidth: 1,
  }
}

function makeArrow(
  elId: string,
  points: [[number, number], [number, number]],
  startBindingId?: string,
  endBindingId?: string,
): DiagramElement {
  return {
    id: elId,
    type: 'arrow',
    points,
    stroke: '#000000',
    strokeWidth: 1,
    startBinding: startBindingId ? { elementId: startBindingId } : null,
    endBinding: endBindingId ? { elementId: endBindingId } : null,
  }
}

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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

describe('useDiagramsStore — viewport delta saves', () => {
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

  it('pan/zoom-only changes PATCH just the viewport, not the scene', async () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    store.setViewport({ scrollX: 40, scrollY: -10, zoom: 1.5 })
    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
    expect(api.diagrams.updateDiagram).toHaveBeenCalledWith(1, {
      viewport: { scrollX: 40, scrollY: -10, zoom: 1.5 },
    })
  })

  it('a scene edit sends the full scene_json even when the viewport also changed', async () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    store.setViewport({ scrollX: 40, scrollY: 0, zoom: 1 })
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(api.diagrams.updateDiagram).mock.calls[0]![1]
    expect(payload.scene_json).toBeDefined()
    expect(payload.scene_json!.elements.map((e) => e.id)).toEqual(['el-1'])
    expect(payload.scene_json!.appState.viewport.scrollX).toBe(40)
  })

  it('after a successful scene save, a later pan saves viewport-only again', async () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()

    store.setViewport({ scrollX: 99, scrollY: 0, zoom: 1 })
    vi.advanceTimersByTime(700)
    await vi.runAllTimersAsync()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)
    const second = vi.mocked(api.diagrams.updateDiagram).mock.calls[1]![1]
    expect(second.scene_json).toBeUndefined()
    expect(second.viewport).toEqual({ scrollX: 99, scrollY: 0, zoom: 1 })
  })

  it('a scene edit landing mid-save is not marked clean by that save', async () => {
    store.id = 1
    let resolveFirst!: (d: Diagram) => void
    vi.mocked(api.diagrams.updateDiagram)
      .mockImplementationOnce(() => new Promise<Diagram>((res) => { resolveFirst = res }))
      .mockResolvedValue(makeDiagram(1, 'Test'))

    // First scene edit → save fires and hangs in flight
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)

    // Scene edit lands while the first save is in flight
    store.addElement(makeRectangle('el-2'))
    resolveFirst(makeDiagram(1, 'Test'))
    await vi.advanceTimersByTimeAsync(700)

    // The follow-up save must carry the full scene (el-2 included), not a
    // viewport-only delta.
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)
    const second = vi.mocked(api.diagrams.updateDiagram).mock.calls[1]![1]
    expect(second.scene_json).toBeDefined()
    expect(second.scene_json!.elements.map((e) => e.id)).toEqual(['el-1', 'el-2'])
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

    expect(api.diagrams.getDiagram).toHaveBeenCalledWith(2, expect.any(AbortSignal))
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

  it('load failure sets loadError flag and leaves elements empty', async () => {
    vi.mocked(api.diagrams.getDiagram).mockRejectedValueOnce(new Error('Not found'))

    await store.loadDiagram(999)

    expect(store.loadError).toBe('Not found')
    expect(store.elements).toHaveLength(0)
  })
})

describe('useDiagramsStore — connector detach on shape delete (ICT-5)', () => {
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

  it('deleting a bound shape detaches its connector but keeps the arrow and its points', () => {
    const R = makeRectangleAt('R', 50, 75)
    const A = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, A]

    store.removeElement('R')

    const found = store.elements.find((e) => e.id === 'arrow-1')
    expect(found).toBeDefined()
    expect(store.elements.find((e) => e.id === 'R')).toBeUndefined()
    if (found?.type === 'arrow') {
      expect(found.points).toEqual([[100, 100], [300, 300]])
      expect(found.startBinding).toBeNull()
    }
  })

  it('deleting a shape bound by two arrows leaves both arrows (now free) and removes only the shape', () => {
    const R = makeRectangleAt('R', 50, 75)
    const A1 = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    const A2 = makeArrow('arrow-2', [[0, 0], [100, 100]], undefined, 'R')
    store.elements = [R, A1, A2]

    store.removeElement('R')

    expect(store.elements.find((e) => e.id === 'R')).toBeUndefined()

    const found1 = store.elements.find((e) => e.id === 'arrow-1')
    const found2 = store.elements.find((e) => e.id === 'arrow-2')
    expect(found1).toBeDefined()
    expect(found2).toBeDefined()
    if (found1?.type === 'arrow') {
      expect(found1.startBinding).toBeNull()
    }
    if (found2?.type === 'arrow') {
      expect(found2.endBinding).toBeNull()
    }
  })

  it('deleting a shape does not touch arrows bound to a different shape', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 200, 200)
    const A = makeArrow('arrow-1', [[250, 225], [400, 400]], undefined, 'S')
    store.elements = [R, S, A]

    store.removeElement('R')

    const found = store.elements.find((e) => e.id === 'arrow-1')
    expect(found).toBeDefined()
    if (found?.type === 'arrow') {
      expect(found.endBinding).toEqual({ elementId: 'S' })
      expect(found.startBinding).toBeNull()
    }
  })
})

describe('ICT-6 persistence', () => {
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

  it('a bound arrow hydrates with its bindings intact on load', async () => {
    const R = makeRectangleAt('R', 50, 75)
    const E = makeRectangleAt('E', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'E')
    const diagram = makeDiagram(1, 'Test', [R, E, arrow])

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-1')
    expect(loaded).toBeDefined()
    if (loaded?.type === 'arrow') {
      expect(loaded.startBinding).toEqual({ elementId: 'R' })
      expect(loaded.endBinding).toEqual({ elementId: 'E' })
    }
  })

  it('a legacy arrow without binding keys loads and is treated as free', async () => {
    const R = makeRectangleAt('R', 50, 75)
    // Hand-built: no startBinding/endBinding keys at all — simulates legacy data
    const legacyArrow: DiagramElement = {
      id: 'arrow-legacy',
      type: 'arrow',
      points: [[100, 100], [300, 300]],
      stroke: '#000000',
      strokeWidth: 1,
    } as DiagramElement
    const diagram = makeDiagram(1, 'Legacy', [R, legacyArrow])

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    await store.loadDiagram(1)

    // Arrow loaded without throwing
    const loaded = store.elements.find((e) => e.id === 'arrow-legacy')
    expect(loaded).toBeDefined()

    // Moving R triggers recomputeBoundConnectors, which visits the legacy arrow.
    // Optional chaining (?.) must not throw when binding keys are undefined.
    expect(() => store.updateElement('R', { x: 130, y: 115 })).not.toThrow()
    // Arrow still present after the move
    expect(store.elements.find((e) => e.id === 'arrow-legacy')).toBeDefined()
  })

  it('after load, moving a bound shape re-routes and the recomputed points are in the next save payload', async () => {
    // R center at (100,100): x=50, y=75
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    const diagram = makeDiagram(1, 'Test', [R, arrow])

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)

    // Move R so new center = (180,140): x=130, y=115
    store.updateElement('R', { x: 130, y: 115 })

    vi.advanceTimersByTime(700)
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    const callArg = vi.mocked(api.diagrams.updateDiagram).mock.calls[0]![1]!
    const savedElements = callArg.scene_json?.elements ?? []
    const savedArrow = savedElements.find((e: DiagramElement) => e.id === 'arrow-1')
    expect(savedArrow).toBeDefined()
    if (savedArrow?.type === 'arrow') {
      // spec-20: start = facing-side midpoint of R toward (300,300) — bottom side, (180,165).
      expect(savedArrow.points[0][0]).toBeCloseTo(180, 1)
      expect(savedArrow.points[0][1]).toBeCloseTo(165, 1)
      expect(savedArrow.points[1]).toEqual([300, 300])
    }
  })

  it('save payload preserves bindings after a mutation post-load', async () => {
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'E')
    const diagram = makeDiagram(1, 'Test', [R, arrow])

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)

    // Trigger a mutation so a save is scheduled
    store.addElement(makeRectangleAt('extra', 400, 400))
    vi.advanceTimersByTime(700)
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    const callArg = vi.mocked(api.diagrams.updateDiagram).mock.calls[0]![1]!
    const savedElements: DiagramElement[] = callArg.scene_json?.elements ?? []
    const savedArrow = savedElements.find((e) => e.id === 'arrow-1')
    expect(savedArrow).toBeDefined()
    if (savedArrow?.type === 'arrow') {
      expect(savedArrow.startBinding).toEqual({ elementId: 'R' })
      expect(savedArrow.endBinding).toEqual({ elementId: 'E' })
    }
  })
})

describe('useDiagramsStore — error channel separation (ICT-2)', () => {
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

  it('failed autosave sets saveError and leaves loadError null', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockRejectedValue(new Error('Network error'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).toBe('Network error')
    expect(store.loadError).toBeNull()
    expect(store.elements).toHaveLength(1)
  })

  it('failed autosave keeps canvas editable: elements remain and dirty stays true', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockRejectedValue(new Error('Network error'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).not.toBeNull()
    expect(store.loadError).toBeNull()
    // Canvas elements are intact — canvas remains usable
    expect(store.elements).toHaveLength(1)
    // id is still set — canvas is not torn down
    expect(store.id).toBe(1)
  })

  it('save recovers: retry success clears saveError', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    // First save attempt fails, second succeeds
    vi.mocked(api.diagrams.updateDiagram)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-retry'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).toBe('Timeout')

    // Advance past the first retry delay (2000ms)
    vi.advanceTimersByTime(2001)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).toBeNull()
    expect(store.dirty).toBe(false)
  })

  it('load failure shows loadError without touching saveError', async () => {
    vi.mocked(api.diagrams.getDiagram).mockRejectedValueOnce(new Error('404 Not Found'))

    await store.loadDiagram(999)

    expect(store.loadError).toBe('404 Not Found')
    expect(store.saveError).toBeNull()
    expect(store.elements).toHaveLength(0)
  })

  it('listError set, then diagram loads successfully: loadError and saveError remain null', async () => {
    // First set a list error
    vi.mocked(api.diagrams.listDiagrams).mockRejectedValueOnce(new Error('List failed'))
    await store.loadList()
    expect(store.listError).toBe('List failed')

    // Then open a diagram successfully
    const diagram = makeDiagram(5, 'My diagram', [makeRectangle('el-a')])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    await store.loadDiagram(5)

    expect(store.loadError).toBeNull()
    expect(store.saveError).toBeNull()
    expect(store.elements).toHaveLength(1)
  })

  it('retry is cancelled when epoch moves (diagram closed mid-retry)', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockRejectedValue(new Error('Network error'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-1'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).not.toBeNull()

    // Close the diagram (bumps epoch, cancels retry)
    vi.mocked(api.diagrams.deleteDiagram).mockResolvedValueOnce(undefined as unknown as void)
    await store.removeDiagram(1)

    // Reset mock so if retry fires it would count
    vi.mocked(api.diagrams.updateDiagram).mockClear()

    // Advance past all retry delays — no further save calls should happen
    vi.advanceTimersByTime(20000)
    await Promise.resolve()
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).not.toHaveBeenCalled()
  })

  it('retry uses backoff: first retry at 2s, second at 5s', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockRejectedValue(new Error('Network error'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-backoff'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    // Initial failure — 1 call total
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    // Advance 1999ms — first retry (2s) has NOT fired yet
    vi.advanceTimersByTime(1999)
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    // Advance 2ms more — first retry fires
    vi.advanceTimersByTime(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)

    // Advance 4999ms — second retry (5s from first retry) has NOT fired yet
    vi.advanceTimersByTime(4999)
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)

    // Advance 2ms more — second retry fires
    vi.advanceTimersByTime(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(3)
  })
})

describe('useDiagramsStore — connector detach on manual drag (ICT-3)', () => {
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

  it('dragging a bound arrow clears both bindings and keeps the translated points', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrow]

    // Simulate drag: buildMovePatch produces a points patch with translated coords
    store.updateElement('arrow-1', { points: [[110, 110], [310, 310]] })

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    if (updated?.type === 'arrow') {
      expect(updated.points).toEqual([[110, 110], [310, 310]])
      expect(updated.startBinding).toBeNull()
      expect(updated.endBinding).toBeNull()
    }
  })

  it('after dragging a bound arrow, moving r1 leaves the arrow points unchanged', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrow]

    // Drag the arrow — detaches bindings
    store.updateElement('arrow-1', { points: [[110, 110], [310, 310]] })

    // Now move R — recomputeBoundConnectors runs but finds no binding to R
    store.updateElement('R', { x: 130, y: 115 })

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    if (updated?.type === 'arrow') {
      // Points must remain at the dragged position, not snapped back to R's new center
      expect(updated.points).toEqual([[110, 110], [310, 310]])
    }
  })

  it('patching a bound arrow with a style-only patch (no points) does not detach bindings', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrow]

    // A style-only patch — no `points` key
    store.updateElement('arrow-1', { stroke: '#ff0000' } as Partial<DiagramElement>)

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    if (updated?.type === 'arrow') {
      expect(updated.startBinding).toEqual({ elementId: 'R' })
      expect(updated.endBinding).toEqual({ elementId: 'S' })
    }
  })

  it('dragging a free arrow (no bindings) keeps it free — no null-write side-effects', () => {
    const arrow = makeArrow('arrow-free', [[0, 0], [100, 100]])
    store.elements = [arrow]

    store.updateElement('arrow-free', { points: [[10, 10], [110, 110]] })

    const updated = store.elements.find((e) => e.id === 'arrow-free')
    expect(updated).toBeDefined()
    if (updated?.type === 'arrow') {
      expect(updated.points).toEqual([[10, 10], [110, 110]])
      expect(updated.startBinding).toBeNull()
      expect(updated.endBinding).toBeNull()
    }
  })

  it('moving a bound shape (rectangle) still re-routes its connector — shape move path is unaffected', () => {
    // Regression: verify that shape.move → recomputeBoundConnectors still works
    // after the detach guard was added. The shape patch does NOT contain `points`,
    // so the guard never fires for a shape update.
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, arrow]

    // Move R so new center = (180,140)
    store.updateElement('R', { x: 130, y: 115 })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(updatedArrow?.type).toBe('arrow')
    if (updatedArrow?.type === 'arrow') {
      // spec-20: start = facing-side midpoint of R toward free end (300,300) — (180,165).
      expect(updatedArrow.points[0][0]).toBeCloseTo(180, 1)
      expect(updatedArrow.points[0][1]).toBeCloseTo(165, 1)
      expect(updatedArrow.points[1]).toEqual([300, 300])
      // Binding on R must still be intact after shape move
      expect(updatedArrow.startBinding).toEqual({ elementId: 'R' })
    }
  })
})

describe('useDiagramsStore — bound connector rerouting (ICT-4)', () => {
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

  it('moving a shape re-routes a connector bound to its start endpoint', () => {
    // R center starts at (100,100): x=50, y=75. Arrow start bound to R.
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, arrow]

    // Move R so new center = (180,140): x=130, y=115
    store.updateElement('R', { x: 130, y: 115 })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updatedArrow.type).toBe('arrow')
    if (updatedArrow.type === 'arrow') {
      // spec-20: start = facing-side midpoint of R toward free end (300,300) — (180,165).
      expect(updatedArrow.points[0][0]).toBeCloseTo(180, 1)
      expect(updatedArrow.points[0][1]).toBeCloseTo(165, 1)
      expect(updatedArrow.points[1]).toEqual([300, 300])
    }
  })

  it('moving one shape of a both-bound arrow re-anchors both endpoints along the new ray', () => {
    // R at center (100,100), E at center (300,300)
    const R = makeRectangleAt('R', 50, 75)
    const E = makeRectangleAt('E', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'E')
    store.elements = [R, E, arrow]

    // Move E so new center = (400,400): x=350, y=375
    store.updateElement('E', { x: 350, y: 375 })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updatedArrow.type).toBe('arrow')
    if (updatedArrow.type === 'arrow') {
      // spec-21 clearance routing: R(50-150 x, 75-125 y), E(350-450 x, 375-425 y).
      // gapX=200, gapY=250 → Y is roomier → route vertical (R-bottom → E-top),
      // overriding the center tie. Start = R bottom mid (100,125); end = E top mid (400,375).
      expect(updatedArrow.points[0][0]).toBeCloseTo(100, 1)
      expect(updatedArrow.points[0][1]).toBeCloseTo(125, 1)
      expect(updatedArrow.points[1][0]).toBeCloseTo(400, 1)
      expect(updatedArrow.points[1][1]).toBeCloseTo(375, 1)
    }
  })

  it('moving an unrelated shape leaves bound connectors unchanged', () => {
    const R = makeRectangleAt('R', 50, 75)
    const U = makeRectangleAt('U', 200, 200)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, U, arrow]

    store.updateElement('U', { x: 0, y: 0 })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updatedArrow.type).toBe('arrow')
    if (updatedArrow.type === 'arrow') {
      expect(updatedArrow.points[0]).toEqual([100, 100])
      expect(updatedArrow.points[1]).toEqual([300, 300])
    }
  })

  it('recompute persists via the debounced autosave with exactly one PATCH', async () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, arrow]

    // Move R so new center = (180,140)
    store.updateElement('R', { x: 130, y: 115 })

    vi.advanceTimersByTime(700)
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    const callArg = vi.mocked(api.diagrams.updateDiagram).mock.calls[0]![1]!
    const savedElements = callArg.scene_json?.elements ?? []
    const savedArrow = savedElements.find((e: DiagramElement) => e.id === 'arrow-1')
    expect(savedArrow).toBeDefined()
    expect(savedArrow!.type).toBe('arrow')
    if (savedArrow!.type === 'arrow') {
      // spec-20: start = facing-side midpoint of R toward free end (300,300) — (180,165).
      expect(savedArrow!.points[0][0]).toBeCloseTo(180, 1)
      expect(savedArrow!.points[0][1]).toBeCloseTo(165, 1)
    }
  })
})

// ─── ICT-6: Both-ends-bound arrow re-anchors both endpoints ──────────────────

describe('useDiagramsStore — both-bound arrow rerouting (ICT-6)', () => {
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

  it('moving one shape re-anchors both ends of a both-bound arrow', () => {
    // A: x=0, y=0, w=100, h=50 → center (50, 25)
    // B: x=300, y=0, w=100, h=50 → center (350, 25)
    const A = makeRectangleAt('A', 0, 0)
    const B = makeRectangleAt('B', 300, 0)
    const arrow = makeArrow('arrow-1', [[50, 25], [350, 25]], 'A', 'B')
    store.elements = [A, B, arrow]

    // Move A right 100 → new A center (150, 25); B center stays (350, 25).
    // New center-to-center ray is purely horizontal.
    store.updateElement('A', { x: 100, y: 0 })

    const updated = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updated.type).toBe('arrow')
    if (updated.type === 'arrow') {
      // Start: on new A boundary (cx=150) facing B center (350,25) → right edge
      expect(updated.points[0][0]).toBeCloseTo(200, 0)
      expect(updated.points[0][1]).toBeCloseTo(25, 0)
      // End: on B boundary (cx=350) facing new A center (150,25) → left edge
      expect(updated.points[1][0]).toBeCloseTo(300, 0)
      expect(updated.points[1][1]).toBeCloseTo(25, 0)
      // Bindings intact
      expect(updated.startBinding).toEqual({ elementId: 'A' })
      expect(updated.endBinding).toEqual({ elementId: 'B' })
    }
  })

  it('resizing a bound shape re-anchors both ends of a both-bound arrow', () => {
    // A: x=0, y=0, w=100, h=50 → center (50, 25)
    // B: x=300, y=0, w=100, h=50 → center (350, 25)
    const A = makeRectangleAt('A', 0, 0)
    const B = makeRectangleAt('B', 300, 0)
    const arrow = makeArrow('arrow-1', [[50, 25], [350, 25]], 'A', 'B')
    store.elements = [A, B, arrow]

    // Widen A to 200 → new A center (100, 25); B center stays (350, 25).
    store.updateElement('A', { width: 200 })

    const updated = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updated.type).toBe('arrow')
    if (updated.type === 'arrow') {
      // Start: on resized A boundary facing B center (350,25) → right edge
      expect(updated.points[0][0]).toBeCloseTo(200, 0)
      expect(updated.points[0][1]).toBeCloseTo(25, 0)
      // End: on B boundary facing new A center (100,25) → left edge
      expect(updated.points[1][0]).toBeCloseTo(300, 0)
      expect(updated.points[1][1]).toBeCloseTo(25, 0)
    }
  })

  it('single-bound arrow: only the bound end recomputes when its shape moves', () => {
    // Regression: single-bound behaviour must be unaffected by the both-ends fix.
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, arrow]

    store.updateElement('R', { x: 130, y: 115 })

    const updated = store.elements.find((e) => e.id === 'arrow-1')!
    expect(updated.type).toBe('arrow')
    if (updated.type === 'arrow') {
      // Start is edge-anchored on R's new boundary facing the free end (300,300).
      expect(updated.points[0][0]).toBeCloseTo(180, 1)
      expect(updated.points[0][1]).toBeCloseTo(165, 1)
      // End (free) is unchanged.
      expect(updated.points[1]).toEqual([300, 300])
    }
  })

  it('self-loop fallback: both ends on the same shape produce center for both', () => {
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-self', [[100, 100], [100, 100]], 'R', 'R')
    store.elements = [R, arrow]

    store.updateElement('R', { x: 130, y: 115 })

    const updated = store.elements.find((e) => e.id === 'arrow-self')!
    expect(updated.type).toBe('arrow')
    if (updated.type === 'arrow') {
      // Both points are the new center of R (130+50, 115+25) = (180, 140)
      expect(updated.points[0][0]).toBeCloseTo(180, 0)
      expect(updated.points[0][1]).toBeCloseTo(140, 0)
      expect(updated.points[1][0]).toBeCloseTo(180, 0)
      expect(updated.points[1][1]).toBeCloseTo(140, 0)
    }
  })
})

// ─── ICT-10: Undo / Redo history ─────────────────────────────────────────────

function makeEllipse(elId: string): DiagramElement {
  return {
    id: elId,
    type: 'ellipse',
    x: 200,
    y: 200,
    width: 80,
    height: 60,
    stroke: '#000000',
    fill: null,
    strokeWidth: 1,
  }
}

describe('useDiagramsStore — undo/redo (ICT-10)', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))
    store.id = 1
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('undo removes the last added element', () => {
    store.addElement(makeRectangle('rect-1'))
    store.addElement(makeEllipse('ellipse-1'))

    expect(store.elements).toHaveLength(2)
    expect(store.canUndo).toBe(true)

    store.undoAction()

    expect(store.elements).toHaveLength(1)
    expect(store.elements[0]!.id).toBe('rect-1')
  })

  it('redo restores the undone element', () => {
    store.addElement(makeRectangle('rect-1'))
    store.addElement(makeEllipse('ellipse-1'))

    store.undoAction()
    expect(store.elements).toHaveLength(1)
    expect(store.canRedo).toBe(true)

    store.redoAction()

    expect(store.elements).toHaveLength(2)
    const ids = store.elements.map((e) => e.id)
    expect(ids).toContain('ellipse-1')
  })

  it('new mutation clears the redo stack', () => {
    store.addElement(makeRectangle('rect-1'))
    store.addElement(makeEllipse('ellipse-1'))

    store.undoAction()
    expect(store.canRedo).toBe(true)

    // Add a new element — redo stack must be cleared
    store.addElement(makeRectangle('rect-2'))
    expect(store.canRedo).toBe(false)

    // redoAction is a no-op now; elements only has rect-1 and rect-2
    store.redoAction()
    const ids = store.elements.map((e) => e.id)
    expect(ids).not.toContain('ellipse-1')
    expect(ids).toContain('rect-1')
    expect(ids).toContain('rect-2')
  })

  it('undo restores bindings: add bound arrow + rect, removeElement(rect) detaches, undoAction restores both', () => {
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)

    // Seed via direct assignment (no history push) then add through the action
    store.elements = [R, arrow]

    // removeElement pushes a snapshot before removal
    store.removeElement('R')

    // Arrow is detached and R is gone
    expect(store.elements.find((e) => e.id === 'R')).toBeUndefined()
    const detachedArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(detachedArrow?.type === 'arrow' && detachedArrow.startBinding).toBeNull()

    // Undo should restore the snapshot that had both R and the bound arrow
    store.undoAction()

    expect(store.elements.find((e) => e.id === 'R')).toBeDefined()
    const restoredArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(restoredArrow).toBeDefined()
    if (restoredArrow?.type === 'arrow') {
      expect(restoredArrow.startBinding).toEqual({ elementId: 'R' })
    }
  })

  it('viewport changes are not history entries: canUndo stays false after setViewport alone', () => {
    expect(store.canUndo).toBe(false)

    store.setViewport({ scrollX: 100, scrollY: 50, zoom: 1.5 })

    // setViewport must not push to history
    expect(store.canUndo).toBe(false)
  })
})

// ─── ICT-11: Multi-select ─────────────────────────────────────────────────────

describe('useDiagramsStore — multi-select (ICT-11)', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))
    store.id = 1
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shift-click toggles an element into the selection', () => {
    store.selectElement('el-1')
    store.selectElement('el-2', true)

    expect(store.selectedIds).toContain('el-1')
    expect(store.selectedIds).toContain('el-2')
  })

  it('shift-click on an already-selected element removes it from the selection', () => {
    store.selectElement('el-1')
    store.selectElement('el-2', true)

    // Toggle el-1 out
    store.selectElement('el-1', true)

    expect(store.selectedIds).not.toContain('el-1')
    expect(store.selectedIds).toContain('el-2')
  })

  it('plain selectElement replaces the whole selection set', () => {
    store.selectElement('el-1')
    store.selectElement('el-2', true)
    expect(store.selectedIds).toHaveLength(2)

    store.selectElement('el-3')

    expect(store.selectedIds).toEqual(['el-3'])
  })

  it('selectElement(null) clears all selected ids', () => {
    store.selectElement('el-1')
    store.selectElement('el-2', true)

    store.selectElement(null)

    expect(store.selectedIds).toHaveLength(0)
  })

  it('backward-compat: selectedId returns the first id in selectedIds', () => {
    store.selectElement('el-a')
    store.selectElement('el-b', true)

    expect(store.selectedId).toBe('el-a')
  })

  it('backward-compat: selectedId is null when nothing is selected', () => {
    expect(store.selectedId).toBeNull()
  })

  it('group delete removes both elements and detaches bindings for all', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrow]

    store.removeElements(['R', 'S'])

    expect(store.elements.find((e) => e.id === 'R')).toBeUndefined()
    expect(store.elements.find((e) => e.id === 'S')).toBeUndefined()

    const remainingArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(remainingArrow).toBeDefined()
    if (remainingArrow?.type === 'arrow') {
      expect(remainingArrow.startBinding).toBeNull()
      expect(remainingArrow.endBinding).toBeNull()
    }
  })

  it('removeElements with an empty array is a no-op and does not push history', () => {
    store.elements = [makeRectangle('el-1')]
    const canUndoBefore = store.canUndo

    store.removeElements([])

    expect(store.elements).toHaveLength(1)
    expect(store.canUndo).toBe(canUndoBefore)
  })
})

// ─── ICT-4: Save lifecycle hardening ─────────────────────────────────────────

describe('useDiagramsStore — save lifecycle hardening (ICT-4)', () => {
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

  it('save success cancels the pending retry', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    // First save fails → retry scheduled at 2s
    vi.mocked(api.diagrams.updateDiagram)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-1'))

    // Fire the debounce → first save attempt fails, retry scheduled
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()
    expect(store.saveError).toBe('Network error')
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)

    // User edits again → debounce timer running; let the debounced save fire (succeeds)
    store.addElement(makeRectangle('el-2'))
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    // Save succeeded: 2 total calls so far (1 fail + 1 success)
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)
    expect(store.saveError).toBeNull()
    expect(store.dirty).toBe(false)

    // Advance past the stale 2s retry window — must NOT fire again
    vi.advanceTimersByTime(2100)
    await Promise.resolve()
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)
  })

  it('flushSave persists dirty state during a retry episode', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    // First save fails → retry pending; subsequent calls succeed
    vi.mocked(api.diagrams.updateDiagram)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)
    store.addElement(makeRectangle('el-1'))

    // Fire the debounce → first attempt fails; debounce timer is now null, dirty true, retry pending
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.saveError).toBe('Network error')
    expect(store.dirty).toBe(true)
    // debounceTimer is null at this point (fired); retry timer is alive

    // flushSave must save even though debounceTimer is null
    await store.flushSave()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(2)
    expect(store.dirty).toBe(false)
    expect(store.saveError).toBeNull()
  })

  it('flushSave with clean state does not call the API', async () => {
    const diagram = makeDiagram(1, 'Test')
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    await store.loadDiagram(1)

    // State: not dirty, no debounce pending
    expect(store.dirty).toBe(false)

    await store.flushSave()

    expect(api.diagrams.updateDiagram).not.toHaveBeenCalled()
  })
})

// ── Helper factories ──────────────────────────────────────────────────────────

function makeTextElement(elId: string): DiagramElement {
  return {
    id: elId,
    type: 'text',
    x: 10,
    y: 10,
    text: 'hello',
    fontSize: 16,
    color: 'currentColor',
  }
}

function makeLineElement(elId: string): DiagramElement {
  return {
    id: elId,
    type: 'line',
    points: [[0, 0], [100, 100]],
    stroke: '#000000',
    strokeWidth: 2,
    startBinding: null,
    endBinding: null,
  }
}

describe('useDiagramsStore — applyStyle (ICT-14)', () => {
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

  it('change stroke color of a selection: rect and line both get the new stroke', () => {
    const rect = makeRectangle('r1')
    const line = makeLineElement('l1')
    store.elements = [rect, line]
    store.selectedIds = ['r1', 'l1']

    store.applyStyle({ stroke: '#e03131' })

    const updatedRect = store.elements.find((e) => e.id === 'r1')
    const updatedLine = store.elements.find((e) => e.id === 'l1')
    expect(updatedRect).toBeDefined()
    expect(updatedLine).toBeDefined()
    if (updatedRect?.type === 'rectangle') expect(updatedRect.stroke).toBe('#e03131')
    if (updatedLine?.type === 'line') expect(updatedLine.stroke).toBe('#e03131')
  })

  it('change stroke color applies to color field of text elements', () => {
    const text = makeTextElement('t1')
    store.elements = [text]
    store.selectedIds = ['t1']

    store.applyStyle({ stroke: '#e03131' })

    const updated = store.elements.find((e) => e.id === 't1')
    expect(updated?.type === 'text' && updated.color).toBe('#e03131')
  })

  it('fill only applies to shapes: rect.fill is set but line is unchanged', () => {
    const rect = makeRectangle('r1')
    const line = makeLineElement('l1')
    store.elements = [rect, line]
    store.selectedIds = ['r1', 'l1']

    store.applyStyle({ fill: '#1971c2' })

    const updatedRect = store.elements.find((e) => e.id === 'r1')
    const updatedLine = store.elements.find((e) => e.id === 'l1')
    if (updatedRect?.type === 'rectangle') expect(updatedRect.fill).toBe('#1971c2')
    // Line has no fill field — the element should be otherwise unchanged
    expect(updatedLine).toBeDefined()
    expect('fill' in (updatedLine ?? {})).toBe(false)
  })

  it('strokeWidth does not apply to text elements', () => {
    const text = makeTextElement('t1')
    store.elements = [text]
    store.selectedIds = ['t1']

    store.applyStyle({ strokeWidth: 4 })

    const updated = store.elements.find((e) => e.id === 't1')
    expect(updated?.type === 'text' && !('strokeWidth' in updated)).toBe(true)
  })

  it('fontSize only applies to text elements: line is unchanged', () => {
    const text = makeTextElement('t1')
    const line = makeLineElement('l1')
    store.elements = [text, line]
    store.selectedIds = ['t1', 'l1']

    store.applyStyle({ fontSize: 24 })

    const updatedText = store.elements.find((e) => e.id === 't1')
    const updatedLine = store.elements.find((e) => e.id === 'l1')
    if (updatedText?.type === 'text') expect(updatedText.fontSize).toBe(24)
    // line strokeWidth must be unchanged
    if (updatedLine?.type === 'line') expect(updatedLine.strokeWidth).toBe(2)
  })

  it('style change is undoable: applyStyle then undoAction restores previous stroke', () => {
    const rect = makeRectangle('r1')
    store.elements = [rect]
    store.selectedIds = ['r1']

    store.applyStyle({ stroke: '#e03131' })

    const after = store.elements.find((e) => e.id === 'r1')
    if (after?.type === 'rectangle') expect(after.stroke).toBe('#e03131')

    store.undoAction()

    const restored = store.elements.find((e) => e.id === 'r1')
    if (restored?.type === 'rectangle') expect(restored.stroke).toBe('#000000')
  })

  it('applyStyle pushes exactly one history entry for multi-element selection', () => {
    const r1 = makeRectangle('r1')
    const r2 = makeRectangle('r2')
    store.elements = [r1, r2]
    store.selectedIds = ['r1', 'r2']

    expect(store.canUndo).toBe(false)
    store.applyStyle({ stroke: '#2f9e44' })
    expect(store.canUndo).toBe(true)

    store.undoAction()
    expect(store.canUndo).toBe(false)
  })

  it('last-used style memory is updated after applyStyle', () => {
    const rect = makeRectangle('r1')
    store.elements = [rect]
    store.selectedIds = ['r1']

    store.applyStyle({ strokeWidth: 4 })

    expect(store.lastStrokeWidth).toBe(4)
  })

  it('applyStyle with empty selection is a no-op and does not push history', () => {
    const rect = makeRectangle('r1')
    store.elements = [rect]
    store.selectedIds = []

    store.applyStyle({ stroke: '#e03131' })

    expect(store.canUndo).toBe(false)
    const el = store.elements.find((e) => e.id === 'r1')
    if (el?.type === 'rectangle') expect(el.stroke).toBe('#000000')
  })

  it('new elements adopt last-used strokeWidth after applyStyle', () => {
    // Set the last-used width via applyStyle on an existing element
    const rect = makeRectangle('r1')
    store.elements = [rect]
    store.selectedIds = ['r1']
    store.applyStyle({ strokeWidth: 4 })

    // The last-used value is now available for builders to read
    expect(store.lastStrokeWidth).toBe(4)
  })

  it('applyStyle on a bound arrow with no points patch does not detach bindings', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrow]
    store.selectedIds = ['arrow-1']

    store.applyStyle({ stroke: '#1971c2' })

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    if (updated?.type === 'arrow') {
      expect(updated.stroke).toBe('#1971c2')
      expect(updated.startBinding).toEqual({ elementId: 'R' })
      expect(updated.endBinding).toEqual({ elementId: 'S' })
    }
  })
})

// ─── ICT-12: styled element persists its style through the save payload ──────

describe('useDiagramsStore — styled element in save payload (ICT-12)', () => {
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

  it('styled element persists its style through the save payload', async () => {
    store.id = 1
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))

    // Add a rect, select it, apply a stroke style
    const rect = makeRectangle('styled-rect')
    store.addElement(rect)
    store.selectElement('styled-rect')
    store.applyStyle({ stroke: '#e03131' })

    // Verify the style applied in memory
    const updated = store.elements.find((e) => e.id === 'styled-rect')
    expect(updated?.type === 'rectangle' && updated.stroke).toBe('#e03131')

    // Advance past the debounce window — save should fire
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(api.diagrams.updateDiagram).mock.calls[0]![1]!
    const savedElements: DiagramElement[] = callArg.scene_json?.elements ?? []
    const savedRect = savedElements.find((e) => e.id === 'styled-rect')
    expect(savedRect).toBeDefined()
    expect(savedRect?.type === 'rectangle' && savedRect.stroke).toBe('#e03131')
  })
})

// ─── ICT-12: legacy center-anchored bound scene unchanged until shape moves ───

describe('useDiagramsStore — legacy center-anchored binding (ICT-12)', () => {
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

  it('legacy center-anchored scene renders unchanged after load; moving the rect re-anchors the endpoint to the boundary', async () => {
    // Legacy scene: rect at x=50, y=75, w=100, h=50 → center (100, 100).
    // Arrow start point sits exactly at the rect center — old behavior from before
    // edge-anchoring was added. After load the point should stay at (100, 100);
    // only when updateElement moves the rect should the endpoint re-anchor.
    const R = makeRectangleAt('R', 50, 75) // center = (100, 100)
    const arrowWithCenterAnchor = makeArrow('arrow-legacy', [[100, 100], [300, 300]], 'R', undefined)
    const diagram = makeDiagram(1, 'Legacy scene', [R, arrowWithCenterAnchor])

    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)
    await store.loadDiagram(1)

    // After load: points are stored as-is (no eager re-anchor on load)
    const arrowAfterLoad = store.elements.find((e) => e.id === 'arrow-legacy')
    expect(arrowAfterLoad).toBeDefined()
    expect(arrowAfterLoad?.type === 'arrow' && arrowAfterLoad.points[0]).toEqual([100, 100])

    // Now move R so new center = (180, 140): x=130, y=115
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Legacy scene'))
    store.updateElement('R', { x: 130, y: 115 })

    // After updateElement the arrow endpoint must be re-anchored to the boundary
    const arrowAfterMove = store.elements.find((e) => e.id === 'arrow-legacy')
    expect(arrowAfterMove?.type).toBe('arrow')
    if (arrowAfterMove?.type === 'arrow') {
      // Edge-anchored: start is on R's new boundary facing (300, 300)
      expect(arrowAfterMove.points[0][0]).toBeCloseTo(180, 1)
      expect(arrowAfterMove.points[0][1]).toBeCloseTo(165, 1)
      // Free end unchanged
      expect(arrowAfterMove.points[1]).toEqual([300, 300])
    }
  })
})

// ─── ICT-11: updateElements batched O(n) operations ──────────────────────────

describe('useDiagramsStore — updateElements batch (ICT-11 FR-B8)', () => {
  let store: ReturnType<typeof useDiagramsStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useDiagramsStore()
    vi.resetAllMocks()
    vi.mocked(api.diagrams.updateDiagram).mockResolvedValue(makeDiagram(1, 'Test'))
    store.id = 1
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('group move patches all elements in one mutation and triggers exactly one save', async () => {
    // 10 elements in the store; 3 are selected and will be patched.
    const others = Array.from({ length: 7 }, (_, i) => makeRectangle(`other-${i}`))
    const r1 = makeRectangleAt('r1', 0, 0)
    const r2 = makeRectangleAt('r2', 200, 0)
    const r3 = makeRectangleAt('r3', 400, 0)
    store.elements = [...others, r1, r2, r3]

    store.updateElements([
      { id: 'r1', patch: { x: 10, y: 10 } },
      { id: 'r2', patch: { x: 210, y: 10 } },
      { id: 'r3', patch: { x: 410, y: 10 } },
    ])

    // All three elements moved to new positions.
    const updated1 = store.elements.find((e) => e.id === 'r1')
    const updated2 = store.elements.find((e) => e.id === 'r2')
    const updated3 = store.elements.find((e) => e.id === 'r3')
    expect(updated1?.type === 'rectangle' && updated1.x).toBe(10)
    expect(updated2?.type === 'rectangle' && updated2.x).toBe(210)
    expect(updated3?.type === 'rectangle' && updated3.x).toBe(410)

    // One scheduleSave call → one debounced PATCH (dirty set, single timer).
    expect(store.dirty).toBe(true)
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
  })

  it('batched patch preserves connector detach guard', () => {
    // Arrow-A: bound and receives a points patch (no binding keys) → should detach.
    // Arrow-B: bound and receives a points patch WITH explicit binding keys → bindings honored.
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 275)
    const arrowA = makeArrow('arrow-a', [[100, 100], [300, 300]], 'R', 'S')
    const arrowB = makeArrow('arrow-b', [[100, 100], [300, 300]], 'R', 'S')
    store.elements = [R, S, arrowA, arrowB]

    store.updateElements([
      // Points patch, no binding keys → should auto-detach.
      { id: 'arrow-a', patch: { points: [[110, 110], [310, 310]] } as Partial<import('@tasknote/shared').DiagramElement> },
      // Points patch WITH explicit binding keys → bindings honored (e.g. re-bind gesture).
      {
        id: 'arrow-b',
        patch: {
          points: [[110, 110], [310, 310]],
          startBinding: { elementId: 'R' },
          endBinding: { elementId: 'S' },
        } as Partial<import('@tasknote/shared').DiagramElement>,
      },
    ])

    const updatedA = store.elements.find((e) => e.id === 'arrow-a')
    const updatedB = store.elements.find((e) => e.id === 'arrow-b')

    // Arrow-A: bindings nulled by the detach guard.
    if (updatedA?.type === 'arrow') {
      expect(updatedA.startBinding).toBeNull()
      expect(updatedA.endBinding).toBeNull()
      expect(updatedA.points).toEqual([[110, 110], [310, 310]])
    }

    // Arrow-B: explicit binding patch honored.
    if (updatedB?.type === 'arrow') {
      expect(updatedB.startBinding).toEqual({ elementId: 'R' })
      expect(updatedB.endBinding).toEqual({ elementId: 'S' })
    }
  })

  it('batched move of a bound shape recomputes its connectors', () => {
    // R at center (100,100): x=50, y=75.
    const R = makeRectangleAt('R', 50, 75)
    const arrow = makeArrow('arrow-1', [[100, 100], [300, 300]], 'R', undefined)
    store.elements = [R, arrow]

    // Batch-move R to new center (180,140): x=130, y=115.
    store.updateElements([{ id: 'R', patch: { x: 130, y: 115 } }])

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(updatedArrow?.type).toBe('arrow')
    if (updatedArrow?.type === 'arrow') {
      // Edge-anchored result identical to single-call path (ICT-12).
      expect(updatedArrow.points[0][0]).toBeCloseTo(180, 1)
      expect(updatedArrow.points[0][1]).toBeCloseTo(165, 1)
      expect(updatedArrow.points[1]).toEqual([300, 300])
    }
  })

  it('nudge uses the batch path: two selected elements both move with one save per keydown', async () => {
    const r1 = makeRectangleAt('r1', 0, 0)
    const r2 = makeRectangleAt('r2', 200, 0)
    store.elements = [r1, r2]

    // Simulate what onKeyDown does: build patches then call updateElements once.
    store.updateElements([
      { id: 'r1', patch: { x: 1, y: 0 } },
      { id: 'r2', patch: { x: 201, y: 0 } },
    ])

    const updated1 = store.elements.find((e) => e.id === 'r1')
    const updated2 = store.elements.find((e) => e.id === 'r2')
    expect(updated1?.type === 'rectangle' && updated1.x).toBe(1)
    expect(updated2?.type === 'rectangle' && updated2.x).toBe(201)

    // One batch call → one debounced PATCH.
    expect(store.dirty).toBe(true)
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
  })

  it('applyStyle uses the batch path: two rects styled with one save call', async () => {
    const r1 = makeRectangle('r1')
    const r2 = makeRectangle('r2')
    store.elements = [r1, r2]
    store.selectedIds = ['r1', 'r2']

    store.applyStyle({ stroke: '#e03131' })

    const updated1 = store.elements.find((e) => e.id === 'r1')
    const updated2 = store.elements.find((e) => e.id === 'r2')
    if (updated1?.type === 'rectangle') expect(updated1.stroke).toBe('#e03131')
    if (updated2?.type === 'rectangle') expect(updated2.stroke).toBe('#e03131')

    // applyStyle → updateElements → one scheduleSave → one debounced PATCH.
    expect(store.dirty).toBe(true)
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    expect(api.diagrams.updateDiagram).toHaveBeenCalledTimes(1)
  })
})

// ── ICT-3: waypoints written on every connector write path ──────────────────

const EPSILON = 0.001

describe('reanchorBoundConnectorsInPlace — waypoints (ICT-3)', () => {
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

  it('both-bound auto arrow: moving a shape stores side-aware waypoints and routeMode auto', () => {
    // R at (50,75): center (100,100). S at (300,75): center (350,100).
    // After moving R down to y=175, centers differ in y: R=(100,200), S=(350,100).
    // Both sides are right/left (|dx|>=|dy|) but y differs → 2-bend Z waypoints.
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 300, 75)
    const arrow: DiagramElement = {
      ...makeArrow('arrow-1', [[154, 100], [296, 100]], 'R', 'S'),
    }
    store.elements = [R, S, arrow]

    // Move R down by 100px: new center (100,200), S center still (350,100).
    store.updateElements([{ id: 'R', patch: { x: 50, y: 175 } }])

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1')
    expect(updatedArrow?.type).toBe('arrow')
    if (updatedArrow?.type !== 'arrow') return

    const newR = store.elements.find((e) => e.id === 'R')!
    const newS = store.elements.find((e) => e.id === 'S')!

    const rCenter = elementCenter(newR)
    const sCenter = elementCenter(newS)
    const expectedStartSide = facingSide(newR, [sCenter.x, sCenter.y])
    const expectedEndSide = facingSide(newS, [rCenter.x, rCenter.y])
    const start = updatedArrow.points[0]
    const end = updatedArrow.points[1]
    const expectedWaypoints = autoWaypoints(start, expectedStartSide, end, expectedEndSide)

    // The route must have interior bends (non-degenerate case).
    expect(expectedWaypoints.length).toBeGreaterThan(0)
    expect((updatedArrow as any).waypoints).toEqual(expectedWaypoints)
    expect((updatedArrow as any).routeMode).toBe('auto')
  })

  // Regression (bug: dragging a bound shape spawned a growing stack of stray,
  // disconnected/diagonal segments). A manual connector now REVERTS to a clean
  // auto side-aware route when its bound shape moves — bounded and always
  // orthogonal, no leg accumulation. (Preserving hand-drawn bends across a move
  // is a tracked spec-21 follow-up requiring a separate waypoints data model.)
  it('manual arrow: moving a bound shape reverts it to a clean orthogonal auto route', () => {
    // R bound at the start; S bound at the end. Manual route with a user bend.
    const R = makeRectangleAt('R', 50, 75)   // center (100,100)
    const S = makeRectangleAt('S', 250, 275) // center (300,300)
    const arrow: DiagramElement = {
      ...makeArrow('arrow-manual', [[150, 100], [250, 300]], 'R', 'S'),
      waypoints: [[200, 100], [200, 300]] as [number, number][],
      routeMode: 'manual',
    } as unknown as DiagramElement

    store.elements = [R, S, arrow]

    // Move R so its anchor changes.
    store.updateElements([{ id: 'R', patch: { x: 50, y: 125 } }])

    const updated = store.elements.find((e) => e.id === 'arrow-manual')
    expect(updated?.type).toBe('arrow')
    if (updated?.type !== 'arrow') return

    // Reverted to auto.
    expect((updated as any).routeMode).toBe('auto')

    // Route equals the side-aware auto route from the new anchors (no stale bends).
    const newR = store.elements.find((e) => e.id === 'R')!
    const newS = store.elements.find((e) => e.id === 'S')!
    const start = updated.points[0]
    const end = updated.points[1]
    const startSide = facingSide(newR, [elementCenter(newS).x, elementCenter(newS).y])
    const endSide = facingSide(newS, [elementCenter(newR).x, elementCenter(newR).y])
    const expected = autoWaypoints(start, startSide, end, endSide)
    expect((updated as any).waypoints).toEqual(expected)

    // Full route must be axis-aligned (the bug produced diagonals).
    const fullRoute: [number, number][] = [start, ...((updated as any).waypoints ?? []), end]
    for (let i = 0; i < fullRoute.length - 1; i++) {
      const [x1, y1] = fullRoute[i]!
      const [x2, y2] = fullRoute[i + 1]!
      const isAxisAligned = Math.abs(x1 - x2) < EPSILON || Math.abs(y1 - y2) < EPSILON
      expect(isAxisAligned, `segment ${i} → ${i + 1} is not axis-aligned: [${x1},${y1}] → [${x2},${y2}]`).toBe(true)
    }
  })
})

// ─── ICT-8: Load-time normalization for legacy scenes ────────────────────────

describe('loadDiagram — legacy connector normalization (ICT-8)', () => {
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

  it('legacy both-bound arrow (no waypoints/routeMode) gets waypoints and routeMode auto after load', async () => {
    // R: x=50, y=75, w=100, h=50 → center (100,100)
    // S: x=300, y=75, w=100, h=50 → center (350,100)
    // Centers differ only in X (purely horizontal) — facingSide will pick right/left.
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 300, 75)
    // Legacy arrow: points at spec-20 center positions, NO waypoints, NO routeMode.
    const legacyArrow: DiagramElement = {
      id: 'arrow-legacy',
      type: 'arrow',
      points: [[100, 100], [350, 100]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: { elementId: 'S' },
    } as DiagramElement
    const diagram = makeDiagram(1, 'Legacy', [R, S, legacyArrow])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-legacy')
    expect(loaded).toBeDefined()
    expect(loaded?.type).toBe('arrow')
    if (loaded?.type !== 'arrow') return

    // Derive the expected values using the same geometry the helper uses.
    const rCenter = elementCenter(R)
    const sCenter = elementCenter(S)
    const startToward: [number, number] = [sCenter.x, sCenter.y]
    const endToward: [number, number] = [rCenter.x, rCenter.y]
    const expectedStart = facingSideAnchor(R, startToward)
    const expectedEnd = facingSideAnchor(S, endToward)
    const expectedStartSide = facingSide(R, startToward)
    const expectedEndSide = facingSide(S, endToward)
    const expectedWaypoints = autoWaypoints(expectedStart, expectedStartSide, expectedEnd, expectedEndSide)

    expect(loaded.points[0]).toEqual(expectedStart)
    expect(loaded.points[1]).toEqual(expectedEnd)
    expect((loaded as any).waypoints).toEqual(expectedWaypoints)
    expect((loaded as any).routeMode).toBe('auto')
  })

  it('manual connector (routeMode manual, waypoints present) is left untouched by load', async () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 300, 75)
    const manualWaypoints: [number, number][] = [[200, 50]]
    const manualArrow: DiagramElement = {
      id: 'arrow-manual',
      type: 'arrow',
      points: [[154, 100], [296, 100]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: { elementId: 'S' },
      waypoints: manualWaypoints,
      routeMode: 'manual',
    } as unknown as DiagramElement
    const diagram = makeDiagram(1, 'Manual', [R, S, manualArrow])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-manual')
    expect(loaded).toBeDefined()
    if (loaded?.type !== 'arrow') return
    expect(loaded.points[0]).toEqual([154, 100])
    expect(loaded.points[1]).toEqual([296, 100])
    expect((loaded as any).waypoints).toEqual(manualWaypoints)
    expect((loaded as any).routeMode).toBe('manual')
  })

  it('connector already auto with waypoints:[] is left untouched by load', async () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 300, 75)
    const autoArrow: DiagramElement = {
      id: 'arrow-auto',
      type: 'arrow',
      points: [[154, 100], [296, 100]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: { elementId: 'S' },
      waypoints: [],
      routeMode: 'auto',
    } as unknown as DiagramElement
    const diagram = makeDiagram(1, 'Auto', [R, S, autoArrow])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-auto')
    expect(loaded).toBeDefined()
    if (loaded?.type !== 'arrow') return
    expect(loaded.points[0]).toEqual([154, 100])
    expect(loaded.points[1]).toEqual([296, 100])
    expect((loaded as any).waypoints).toEqual([])
    expect((loaded as any).routeMode).toBe('auto')
  })

  it('legacy one-bound arrow gets waypoints:[] and routeMode auto, points unchanged', async () => {
    const R = makeRectangleAt('R', 50, 75)
    const oneBoundArrow: DiagramElement = {
      id: 'arrow-one-bound',
      type: 'arrow',
      points: [[154, 100], [400, 200]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: null,
    } as DiagramElement
    const diagram = makeDiagram(1, 'OneBound', [R, oneBoundArrow])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-one-bound')
    expect(loaded).toBeDefined()
    if (loaded?.type !== 'arrow') return
    // Points are NOT recomputed for one-bound connectors.
    expect(loaded.points[0]).toEqual([154, 100])
    expect(loaded.points[1]).toEqual([400, 200])
    expect((loaded as any).waypoints).toEqual([])
    expect((loaded as any).routeMode).toBe('auto')
  })

  it('legacy unbound arrow gets waypoints:[] and routeMode auto, points unchanged', async () => {
    const freeArrow: DiagramElement = {
      id: 'arrow-free',
      type: 'arrow',
      points: [[0, 0], [100, 100]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: null,
      endBinding: null,
    } as DiagramElement
    const diagram = makeDiagram(1, 'Free', [freeArrow])
    vi.mocked(api.diagrams.getDiagram).mockResolvedValueOnce(diagram)

    await store.loadDiagram(1)

    const loaded = store.elements.find((e) => e.id === 'arrow-free')
    expect(loaded).toBeDefined()
    if (loaded?.type !== 'arrow') return
    expect(loaded.points[0]).toEqual([0, 0])
    expect(loaded.points[1]).toEqual([100, 100])
    expect((loaded as any).waypoints).toEqual([])
    expect((loaded as any).routeMode).toBe('auto')
  })
})

describe('useDiagramsStore — resetConnectorRoute (ICT-7)', () => {
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

  it('both-bound manual arrow resets to auto with recomputed waypoints and preserves bindings', () => {
    // R: center (100,100); x=50, y=75, w=100, h=50
    // S: center (300,200); x=250, y=175, w=100, h=50
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 175)

    // Precompute the expected auto-route so we can assert equality.
    const startCenter = elementCenter(R)
    const endCenter = elementCenter(S)
    const startToward: [number, number] = [endCenter.x, endCenter.y]
    const endToward: [number, number] = [startCenter.x, startCenter.y]
    const expectedStart = facingSideAnchor(R, startToward)
    const expectedEnd = facingSideAnchor(S, endToward)
    const expectedStartSide = facingSide(R, startToward)
    const expectedEndSide = facingSide(S, endToward)
    const expectedWaypoints = autoWaypoints(expectedStart, expectedStartSide, expectedEnd, expectedEndSide)

    const manualArrow: DiagramElement = {
      id: 'arrow-1',
      type: 'arrow',
      points: [[100, 100], [300, 200]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: { elementId: 'S' },
      // Manual waypoints that will be wiped out
      ...({ waypoints: [[150, 100], [150, 200]], routeMode: 'manual' } as object),
    } as DiagramElement

    store.elements = [R, S, manualArrow]

    store.resetConnectorRoute('arrow-1')

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    expect((updated as any).routeMode).toBe('auto')
    expect((updated as any).waypoints).toEqual(expectedWaypoints)
    // Bindings must be preserved — not nulled out by the detach guard
    expect((updated as any).startBinding).toEqual({ elementId: 'R' })
    expect((updated as any).endBinding).toEqual({ elementId: 'S' })
  })

  it('one-bound manual arrow resets routeMode to auto and clears waypoints', () => {
    const R = makeRectangleAt('R', 50, 75)
    const manualArrow: DiagramElement = {
      id: 'arrow-1',
      type: 'arrow',
      points: [[100, 100], [300, 200]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: null,
      ...({ waypoints: [[150, 100], [150, 200]], routeMode: 'manual' } as object),
    } as DiagramElement

    store.elements = [R, manualArrow]

    store.resetConnectorRoute('arrow-1')

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    expect((updated as any).routeMode).toBe('auto')
    expect((updated as any).waypoints).toEqual([])
  })

  it('unbound manual arrow resets routeMode to auto and clears waypoints, keeps points', () => {
    const manualArrow: DiagramElement = {
      id: 'arrow-1',
      type: 'arrow',
      points: [[10, 20], [200, 300]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: null,
      endBinding: null,
      ...({ waypoints: [[50, 50]], routeMode: 'manual' } as object),
    } as DiagramElement

    store.elements = [manualArrow]

    store.resetConnectorRoute('arrow-1')

    const updated = store.elements.find((e) => e.id === 'arrow-1')
    expect(updated).toBeDefined()
    expect((updated as any).routeMode).toBe('auto')
    expect((updated as any).waypoints).toEqual([])
    // Points are unchanged for the unbound case
    expect((updated as any).points).toEqual([[10, 20], [200, 300]])
  })

  it('creates exactly one history entry — undo restores manual waypoints', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 175)
    const manualWaypoints: [number, number][] = [[150, 100], [150, 200]]
    const manualArrow: DiagramElement = {
      id: 'arrow-1',
      type: 'arrow',
      points: [[100, 100], [300, 200]],
      stroke: '#000000',
      strokeWidth: 1,
      startBinding: { elementId: 'R' },
      endBinding: { elementId: 'S' },
      ...({ waypoints: manualWaypoints, routeMode: 'manual' } as object),
    } as DiagramElement

    store.elements = [R, S, manualArrow]

    store.resetConnectorRoute('arrow-1')

    // Confirm it changed
    expect((store.elements.find((e) => e.id === 'arrow-1') as any).routeMode).toBe('auto')

    // Undo restores the manual state
    store.undoAction()

    const restored = store.elements.find((e) => e.id === 'arrow-1')
    expect((restored as any).routeMode).toBe('manual')
    expect((restored as any).waypoints).toEqual(manualWaypoints)
  })

  it('no-ops when id does not match a connector', () => {
    const R = makeRectangleAt('R', 50, 75)
    store.elements = [R]

    // Should not throw, should leave elements unchanged
    expect(() => store.resetConnectorRoute('R')).not.toThrow()
    expect((store.elements.find((e) => e.id === 'R') as any).routeMode).toBeUndefined()
  })

  // ICT-6: reset clears userBends so a subsequent move can't recompose a manual route.
  it('clears userBends back to auto on reset', () => {
    const R = makeRectangleAt('R', 50, 75)
    const S = makeRectangleAt('S', 250, 175)
    const manualArrow: DiagramElement = {
      ...makeArrow('arrow-1', [[100, 100], [300, 200]], 'R', 'S'),
      ...({ userBends: [[150, 130]], waypoints: [[150, 130]], routeMode: 'manual' } as object),
    } as DiagramElement
    store.elements = [R, S, manualArrow]

    store.resetConnectorRoute('arrow-1')

    const updated = store.elements.find((e) => e.id === 'arrow-1') as any
    expect(updated.routeMode).toBe('auto')
    expect(updated.userBends).toBeUndefined()
  })
})

describe('useDiagramsStore — manual route preservation on move (ICT-3)', () => {
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

  // Build a both-bound manual arrow carrying a single user bend, recomposed
  // consistently with the store's own composer so the assertion tracks geometry.
  function setupManualArrow(rx: number, ry: number, sx: number, sy: number, bend: [number, number]) {
    const R = makeRectangleAt('R', rx, ry)
    const S = makeRectangleAt('S', sx, sy)
    const { startSide, endSide } = chooseConnectorSides(R, S)
    const start = anchorForSide(R, startSide)
    const end = anchorForSide(S, endSide)
    const waypoints = composeManualRoute(start, startSide, [bend], end, endSide)
    const arrow: DiagramElement = {
      ...makeArrow('arrow-1', [start, end], 'R', 'S'),
      ...({ userBends: [bend], waypoints, routeMode: 'manual' } as object),
    } as DiagramElement
    store.elements = [R, S, arrow]
    return { R, S }
  }

  it('keeps the user bend fixed and reconnects the leg when a bound shape moves', () => {
    // x=180 is distinct from both anchor x-lines so the bend can't collapse away.
    const bend: [number, number] = [180, 140]
    setupManualArrow(50, 75, 250, 175, bend)

    // Move R down by 5px (keeps R left of S so sides stay right→left).
    store.updateElements([{ id: 'R', patch: { x: 50, y: 80 } }])

    const arrow = store.elements.find((e) => e.id === 'arrow-1') as any
    const R2 = store.elements.find((e) => e.id === 'R')!
    const S = store.elements.find((e) => e.id === 'S')!

    // routeMode stays manual, userBends untouched, waypoints recomposed against
    // the new anchors.
    expect(arrow.routeMode).toBe('manual')
    expect(arrow.userBends).toEqual([bend])
    const { startSide, endSide } = chooseConnectorSides(R2, S)
    const start = anchorForSide(R2, startSide)
    const end = anchorForSide(S, endSide)
    expect(arrow.waypoints).toEqual(composeManualRoute(start, startSide, [bend], end, endSide))
    // The bend's x-line survives — the route still turns at x=180.
    expect(arrow.waypoints.some((p: [number, number]) => p[0] === bend[0])).toBe(true)
  })

  it('does not accumulate leg corners over repeated moves', () => {
    const bend: [number, number] = [180, 140]
    setupManualArrow(50, 75, 250, 175, bend)

    for (let i = 0; i < 5; i++) {
      const r = store.elements.find((e) => e.id === 'R') as any
      store.updateElements([{ id: 'R', patch: { x: r.x + 5, y: r.y } }])
    }

    const arrow = store.elements.find((e) => e.id === 'arrow-1') as any
    const R2 = store.elements.find((e) => e.id === 'R')!
    const S = store.elements.find((e) => e.id === 'S')!
    const { startSide, endSide } = chooseConnectorSides(R2, S)
    const start = anchorForSide(R2, startSide)
    const end = anchorForSide(S, endSide)
    // After N moves, the route equals a single fresh recompose — no pile-up.
    expect(arrow.waypoints).toEqual(composeManualRoute(start, startSide, [bend], end, endSide))
    expect(arrow.userBends).toEqual([bend])
  })

  it('keeps a bend that ends up inside the moved shape (no bbox filtering)', () => {
    const bend: [number, number] = [180, 140]
    setupManualArrow(50, 75, 250, 175, bend)

    // Move R so its bbox engulfs the bend at (180,140): x=150..250, y=120..170.
    store.updateElements([{ id: 'R', patch: { x: 150, y: 120 } }])

    const arrow = store.elements.find((e) => e.id === 'arrow-1') as any
    expect(arrow.userBends).toEqual([bend])
  })
})
