import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement } from '@tasknote/shared'

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('@/api', () => ({
  diagrams: {
    getDiagram: vi.fn().mockResolvedValue({
      id: 1,
      title: 'Test',
      scene_json: {
        version: 1,
        elements: [],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    }),
    updateDiagram: vi.fn().mockResolvedValue({}),
  },
}))

// ── Mount tracking ────────────────────────────────────────────────────────────

const _mountedWrappers: VueWrapper[] = []

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEllipse(id = 'el-1'): DiagramElement {
  return {
    id,
    type: 'ellipse',
    x: 50,
    y: 50,
    width: 100,
    height: 60,
    stroke: '#000000',
    strokeWidth: 2,
    fill: null,
  }
}

function makeRect(id = 'rect-1', x = 10, y = 10): DiagramElement {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: 100,
    height: 80,
    stroke: '#000000',
    strokeWidth: 2,
    fill: null,
  }
}

async function mountCanvasWithElements(elements: DiagramElement[]) {
  const { diagrams: apiDiagrams } = await import('@/api')
  vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
    id: 1,
    title: 'Test',
    scene_json: {
      version: 1,
      elements,
      appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
    },
  } as never)

  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(DiagramCanvas, {
    global: { plugins: [pinia] },
    props: { diagramId: 1 },
    attachTo: document.body,
  })
  _mountedWrappers.push(wrapper)

  await flushPromises()

  const storeState = pinia.state.value['diagrams']
  storeState.tool = 'select'
  storeState.loading = false
  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramSelection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  it('clicking an element selects it and renders a selection outline', async () => {
    const ellipse = makeEllipse('ell-1')
    const { wrapper, pinia } = await mountCanvasWithElements([ellipse])

    // Find any element node with data-element-id="ell-1"
    const elementNode = wrapper.find('[data-element-id="ell-1"]')
    expect(elementNode.exists()).toBe(true)

    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).toContain('ell-1')

    const outline = wrapper.find('.diagram-selection-outline')
    expect(outline.exists()).toBe(true)
  })

  it('dragging a selected rectangle by (40,0) screen-space at zoom 1 updates x by 40, y unchanged', async () => {
    const rect = makeRect('rect-move', 10, 10)
    const { wrapper, pinia } = await mountCanvasWithElements([rect])

    const svg = wrapper.find('svg.diagram-canvas')
    const elementNode = wrapper.find('[data-element-id="rect-move"]')

    // Select + begin move
    await elementNode.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Drag 40px right in screen space; zoom=1 so scene delta === screen delta
    await svg.trigger('pointermove', { clientX: 90, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // End move
    await svg.trigger('pointerup', { clientX: 90, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const moved = elements.find((e) => e.id === 'rect-move')
    expect(moved).toBeDefined()
    expect((moved as any).x).toBe(50)
    expect((moved as any).y).toBe(10)
  })

  it('Delete removes the selected element and clears selectedId', async () => {
    const ellipse = makeEllipse('del-me')
    const { wrapper, pinia } = await mountCanvasWithElements([ellipse])

    const elementNode = wrapper.find('[data-element-id="del-me"]')
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).toContain('del-me')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect(elements.find((e) => e.id === 'del-me')).toBeUndefined()
    expect(pinia.state.value['diagrams'].selectedIds).toHaveLength(0)
  })

  it('single selection: clicking a second element replaces selection', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    // Select A
    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedIds).toContain('el-A')

    // Now select B — this triggers pointerdown on el-B's node
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedIds).toContain('el-B')
    expect(pinia.state.value['diagrams'].selectedIds).not.toContain('el-A')
  })

  it('line element renders a transparent hit-target sibling', async () => {
    const line: DiagramElement = {
      id: 'line-1',
      type: 'line',
      points: [[0, 0], [100, 0]],
      stroke: '#000000',
      strokeWidth: 2,
    }
    const { wrapper } = await mountCanvasWithElements([line])

    // Both the visible line and the hit-target carry data-element-id
    const hits = wrapper.findAll('[data-element-id="line-1"]')
    expect(hits.length).toBeGreaterThanOrEqual(2)

    // At least one of those is the transparent hit-target class
    const hitTarget = wrapper.find('.diagram-hit-target[data-element-id="line-1"]')
    expect(hitTarget.exists()).toBe(true)
  })

  it('clicking empty canvas clears selection', async () => {
    const ellipse = makeEllipse('clear-me')
    const { wrapper, pinia } = await mountCanvasWithElements([ellipse])

    // First select the element
    const elementNode = wrapper.find('[data-element-id="clear-me"]')
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedIds).toContain('clear-me')

    // Click on SVG directly (no data-element-id on the svg itself)
    const svg = wrapper.find('svg.diagram-canvas')
    await svg.trigger('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).toHaveLength(0)
  })
})

// ── ICT-11 multi-select behavior tests ────────────────────────────────────────

describe('DiagramSelection — multi-select (ICT-11)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  it('shift-click on a second element adds it to the selection', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()

    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()

    const ids = pinia.state.value['diagrams'].selectedIds as string[]
    expect(ids).toContain('el-A')
    expect(ids).toContain('el-B')
  })

  it('shift-click on an already-selected element deselects it', async () => {
    const elA = makeRect('el-A', 10, 10)
    const { wrapper, pinia } = await mountCanvasWithElements([elA])

    const nodeA = wrapper.find('[data-element-id="el-A"]')
    // First select it
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedIds).toContain('el-A')

    // Shift-click again to deselect
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).not.toContain('el-A')
  })

  it('plain click on a new element replaces the multi-selection', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const elC = makeRect('el-C', 400, 400)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB, elC])

    // Build a 2-element selection
    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()
    expect((pinia.state.value['diagrams'].selectedIds as string[]).length).toBe(2)

    // Plain click on el-C replaces selection
    const nodeC = wrapper.find('[data-element-id="el-C"]')
    await nodeC.trigger('pointerdown', { clientX: 450, clientY: 450, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()

    const ids = pinia.state.value['diagrams'].selectedIds as string[]
    expect(ids).toEqual(['el-C'])
  })

  it('group move: dragging one of two selected elements applies the same delta to both', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    const svg = wrapper.find('svg.diagram-canvas')

    // Select el-A then shift-select el-B
    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 50, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 240, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()

    // Now begin a plain-click drag on el-A (both are selected)
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 50, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()

    // Drag 30px right, 20px down
    await svg.trigger('pointermove', { clientX: 90, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    await svg.trigger('pointerup', { clientX: 90, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const movedA = elements.find((e) => e.id === 'el-A') as any
    const movedB = elements.find((e) => e.id === 'el-B') as any

    expect(movedA.x).toBe(10 + 30)
    expect(movedA.y).toBe(10 + 20)
    expect(movedB.x).toBe(200 + 30)
    expect(movedB.y).toBe(200 + 20)
  })

  it('selection outline is rendered for multi-selection (union bbox covers all selected elements)', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()

    expect((pinia.state.value['diagrams'].selectedIds as string[]).length).toBe(2)
    const outline = wrapper.find('.diagram-selection-outline')
    expect(outline.exists()).toBe(true)
  })

  it('marquee selects all elements whose bboxes intersect the drag rectangle', async () => {
    // elA at (10,10) w100 h80 — inside a (0,0)→(200,200) marquee
    // elB at (300,300) w100 h80 — outside
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 300, 300)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    const svg = wrapper.find('svg.diagram-canvas')

    // Drag on empty canvas from (0,0) to (200,200) in screen coords (zoom=1)
    await svg.trigger('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    await wrapper.vm.$nextTick()
    await svg.trigger('pointermove', { clientX: 200, clientY: 200, pointerId: 1 })
    await wrapper.vm.$nextTick()
    await svg.trigger('pointerup', { clientX: 200, clientY: 200, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const ids = pinia.state.value['diagrams'].selectedIds as string[]
    expect(ids).toContain('el-A')
    expect(ids).not.toContain('el-B')
  })

  it('Delete key removes all selected elements and clears selectedIds', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1, shiftKey: false })
    await wrapper.vm.$nextTick()
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1, shiftKey: true })
    await wrapper.vm.$nextTick()
    expect((pinia.state.value['diagrams'].selectedIds as string[]).length).toBe(2)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect(elements.find((e) => e.id === 'el-A')).toBeUndefined()
    expect(elements.find((e) => e.id === 'el-B')).toBeUndefined()
    expect(pinia.state.value['diagrams'].selectedIds).toHaveLength(0)
  })
})

// ── ICT-1 gesture-scoped history acceptance scenarios ─────────────────────────

describe('DiagramSelection — gesture-scoped history (ICT-1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  // Scenario: click-select does not destroy redo
  it('click-select does not destroy redo: after undo, clicking an element preserves the redo stack', async () => {
    const rect = makeRect('rect-redo', 50, 50)
    const { wrapper, pinia } = await mountCanvasWithElements([rect])
    const store = useDiagramsStore(pinia)

    // Produce a history entry via addElement
    store.addElement(makeRect('rect-second', 200, 200))
    await wrapper.vm.$nextTick()

    // Undo — redo stack now holds the "rect-second was added" state
    store.undoAction()
    await wrapper.vm.$nextTick()

    expect(store.canRedo).toBe(true)

    // Act: click on rect-redo (pointerdown + pointerup, no move)
    const elementNode = wrapper.find('[data-element-id="rect-redo"]')
    expect(elementNode.exists()).toBe(true)
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await elementNode.trigger('pointerup', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Assert: redo stack is still intact — redoAction restores rect-second
    expect(store.canRedo).toBe(true)
    store.redoAction()
    await wrapper.vm.$nextTick()

    const elementsAfterRedo = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect(elementsAfterRedo.find((e) => e.id === 'rect-second')).toBeDefined()
  })

  // Scenario: click without drag adds no history entry
  it('click without drag adds no history entry: only the prior mutation is undoable', async () => {
    const rect = makeRect('rect-click', 50, 50)
    const { wrapper, pinia } = await mountCanvasWithElements([rect])
    const store = useDiagramsStore(pinia)

    // Create exactly one committed mutation
    store.addElement(makeRect('rect-extra', 200, 200))
    await wrapper.vm.$nextTick()

    // Act: click rect-click (down + up, no move)
    const elementNode = wrapper.find('[data-element-id="rect-click"]')
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await elementNode.trigger('pointerup', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // First undo removes the addElement mutation
    store.undoAction()
    await wrapper.vm.$nextTick()

    const afterFirstUndo = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect(afterFirstUndo.find((e) => e.id === 'rect-extra')).toBeUndefined()

    // No further undo entries — the bare click pushed nothing
    expect(store.canUndo).toBe(false)
  })

  // Scenario: drag gesture is exactly one history entry
  it('drag gesture is exactly one undo entry: one undo restores original position', async () => {
    const rect = makeRect('rect-drag', 10, 10)
    const { wrapper, pinia } = await mountCanvasWithElements([rect])
    const store = useDiagramsStore(pinia)

    const svg = wrapper.find('svg.diagram-canvas')
    const elementNode = wrapper.find('[data-element-id="rect-drag"]')

    // Drag: down → two moves → up (verifies hasPushed fires exactly once)
    await elementNode.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 70, clientY: 60, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 90, clientY: 70, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 90, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Element should have moved 40px right, 20px down
    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const moved = elements.find((e) => e.id === 'rect-drag') as any
    expect(moved.x).toBe(50)  // 10 + 40
    expect(moved.y).toBe(30)  // 10 + 20

    // One undo restores the original position
    store.undoAction()
    await wrapper.vm.$nextTick()

    const restored = (pinia.state.value['diagrams'].elements as DiagramElement[]).find(
      (e) => e.id === 'rect-drag',
    ) as any
    expect(restored.x).toBe(10)
    expect(restored.y).toBe(10)

    // No further undo — the initial state had no prior mutations
    expect(store.canUndo).toBe(false)
  })

  // Scenario: bare click (no drag) after undo still allows redo
  it('click on element after undo does not clear redo: redo restores geometry', async () => {
    const rectA = makeRect('rect-a', 10, 10)
    const rectB = makeRect('rect-b', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([rectA, rectB])
    const store = useDiagramsStore(pinia)

    // Move rect-a by dragging it
    const svg = wrapper.find('svg.diagram-canvas')
    const nodeA = wrapper.find('[data-element-id="rect-a"]')
    await nodeA.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 100, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 100, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const movedX = ((pinia.state.value['diagrams'].elements as DiagramElement[]).find(
      (e) => e.id === 'rect-a',
    ) as any).x
    expect(movedX).toBe(60) // 10 + 50

    // Undo the drag — rect-a back at x=10
    store.undoAction()
    await wrapper.vm.$nextTick()
    expect(store.canRedo).toBe(true)

    // Click rect-b (select only, no move) — must NOT clear redo
    const nodeB = wrapper.find('[data-element-id="rect-b"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1 })
    await nodeB.trigger('pointerup', { clientX: 250, clientY: 250, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(store.canRedo).toBe(true)

    // Redo restores the drag
    store.redoAction()
    await wrapper.vm.$nextTick()

    const afterRedo = ((pinia.state.value['diagrams'].elements as DiagramElement[]).find(
      (e) => e.id === 'rect-a',
    ) as any).x
    expect(afterRedo).toBe(60)
  })
})
