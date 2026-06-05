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
