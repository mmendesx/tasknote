import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement } from '@tasknote/shared'
import { boundEndpoint } from '../connectors'

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

function makeRect(id = 'rect-1', x = 100, y = 50): DiagramElement {
  return {
    id,
    type: 'rectangle' as const,
    x,
    y,
    width: 80,
    height: 60,
    stroke: '#000000',
    fill: null,
    strokeWidth: 2,
  }
}

function makeArrow(
  id: string,
  points: [[number, number], [number, number]],
  startBinding: { elementId: string } | null = null,
  endBinding: { elementId: string } | null = null,
): DiagramElement {
  return { id, type: 'arrow', points, stroke: '#000000', strokeWidth: 2, startBinding, endBinding }
}

async function mountCanvas(diagramId = 1) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(DiagramCanvas, {
    global: { plugins: [pinia] },
    props: { diagramId },
    attachTo: document.body,
  })
  _mountedWrappers.push(wrapper)

  await flushPromises()
  return { wrapper, pinia, store: useDiagramsStore(pinia) }
}

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  // SCN: pressing R activates the rectangle tool
  it('pressing R activates the rectangle tool', async () => {
    const { store } = await mountCanvas()

    expect(store.tool).toBe('select')
    fireKey('r')

    expect(store.tool).toBe('rectangle')
  })

  // SCN: pressing key is case-insensitive (uppercase R also works)
  it('pressing uppercase R activates the rectangle tool', async () => {
    const { store } = await mountCanvas()

    fireKey('R')

    expect(store.tool).toBe('rectangle')
  })

  // SCN: all tool shortcuts map correctly
  it.each([
    ['v', 'select'],
    ['h', 'hand'],
    ['r', 'rectangle'],
    ['e', 'ellipse'],
    ['o', 'ellipse'],
    ['l', 'line'],
    ['a', 'arrow'],
    ['t', 'text'],
    ['p', 'pen'],
  ])('pressing %s activates tool %s', async (key, expectedTool) => {
    const { store } = await mountCanvas()

    fireKey(key)

    expect(store.tool).toBe(expectedTool)
  })

  // SCN: shortcuts do not fire while typing in a text input
  it('shortcuts do not fire while typing in a text input', async () => {
    const { store } = await mountCanvas()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const toolBefore = store.tool
    fireKey('r')

    expect(store.tool).toBe(toolBefore)

    input.blur()
    document.body.removeChild(input)
  })

  // SCN: ctrl+r does not switch tool (modifier guard)
  it('ctrl+r does not switch tool', async () => {
    const { store } = await mountCanvas()

    const toolBefore = store.tool
    fireKey('r', { ctrlKey: true })

    expect(store.tool).toBe(toolBefore)
  })

  // SCN: cmd+r does not switch tool (modifier guard)
  it('meta+r does not switch tool', async () => {
    const { store } = await mountCanvas()

    const toolBefore = store.tool
    fireKey('r', { metaKey: true })

    expect(store.tool).toBe(toolBefore)
  })

  // SCN: alt+r does not switch tool (modifier guard)
  it('alt+r does not switch tool', async () => {
    const { store } = await mountCanvas()

    const toolBefore = store.tool
    fireKey('r', { altKey: true })

    expect(store.tool).toBe(toolBefore)
  })

  // SCN: escape clears selection
  it('escape clears selection', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.elements = [makeRect()]
    state.selectedIds = ['rect-1']

    fireKey('Escape')

    expect(store.selectedIds).toHaveLength(0)
  })

  // SCN: arrow keys nudge selection — ArrowRight x2 then Shift+ArrowRight → x=112
  it('arrow keys nudge selection: ArrowRight x2 then Shift+ArrowRight → x=112', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    state.elements = [rect]
    state.selectedIds = ['rect-1']

    // Two single-step nudges (+1 each)
    fireKey('ArrowRight')
    fireKey('ArrowRight')
    // One shift-nudge (+10)
    fireKey('ArrowRight', { shiftKey: true })

    const updated = store.elements.find((e) => e.id === 'rect-1')
    expect(updated).toBeDefined()
    expect((updated as { x: number }).x).toBe(112)
  })

  // SCN: nudge is undoable as one burst — 3 rapid ArrowRight then undo → original x
  it('nudge is undoable as one burst', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    state.elements = [rect]
    state.selectedIds = ['rect-1']

    // Push an initial history entry so there is something to undo TO
    store.pushHistory()

    // Three rapid nudges within the debounce window — should produce one history entry
    fireKey('ArrowRight')
    fireKey('ArrowRight')
    fireKey('ArrowRight')

    // x should now be 103
    const afterNudge = store.elements.find((e) => e.id === 'rect-1')
    expect((afterNudge as { x: number }).x).toBe(103)

    // Undo once — should revert all 3 nudges back to x=100
    store.undoAction()

    const afterUndo = store.elements.find((e) => e.id === 'rect-1')
    expect((afterUndo as { x: number }).x).toBe(100)
  })

  // SCN: a pause between nudge bursts creates separate history entries
  it('nudge after debounce pause creates a new history entry', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    state.elements = [rect]
    state.selectedIds = ['rect-1']

    // First burst
    fireKey('ArrowRight')
    fireKey('ArrowRight')

    // Advance time beyond the debounce threshold
    vi.advanceTimersByTime(600)

    // Second burst — should produce a NEW history entry
    fireKey('ArrowRight')
    fireKey('ArrowRight')

    // x should now be 104
    const afterNudge = store.elements.find((e) => e.id === 'rect-1')
    expect((afterNudge as { x: number }).x).toBe(104)

    // First undo reverts the second burst (back to 102)
    store.undoAction()
    const afterFirstUndo = store.elements.find((e) => e.id === 'rect-1')
    expect((afterFirstUndo as { x: number }).x).toBe(102)

    // Second undo reverts the first burst (back to 100)
    store.undoAction()
    const afterSecondUndo = store.elements.find((e) => e.id === 'rect-1')
    expect((afterSecondUndo as { x: number }).x).toBe(100)
  })

  // ICT-12: Ctrl+Z undoes through the real onKeyDown handler
  it('Ctrl+Z keydown undoes last add; Ctrl+Shift+Z redoes; text-input focused blocks undo', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null

    // Add two elements through the store so there is history to undo
    store.addElement(makeRect('r1', 10, 10))
    store.addElement(makeRect('r2', 100, 100))
    expect(store.elements).toHaveLength(2)
    expect(store.canUndo).toBe(true)

    // Ctrl+Z — undoes the last addElement (r2 disappears)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await Promise.resolve()
    expect(store.elements).toHaveLength(1)
    expect(store.elements[0]!.id).toBe('r1')
    expect(store.canRedo).toBe(true)

    // Ctrl+Shift+Z — redoes (r2 comes back)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }))
    await Promise.resolve()
    expect(store.elements).toHaveLength(2)

    // Undo once more to set up the blocking test
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await Promise.resolve()
    expect(store.elements).toHaveLength(1)

    // While a text input is focused, Ctrl+Z must NOT fire undo
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await Promise.resolve()
    expect(store.elements).toHaveLength(1) // unchanged

    input.blur()
    document.body.removeChild(input)
  })

  // ICT-12: uppercase Z variant (Ctrl+Shift+Z producing uppercase Z) also redoes
  it('Ctrl+Z uppercase variant (Ctrl+Z with key="Z") triggers redo', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null

    store.addElement(makeRect('r1', 10, 10))
    store.addElement(makeRect('r2', 100, 100))

    // Undo to create a redo entry
    store.undoAction()
    expect(store.elements).toHaveLength(1)
    expect(store.canRedo).toBe(true)

    // Ctrl+Z with uppercase key='Z' (some platform-specific key events produce this)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, bubbles: true }))
    await Promise.resolve()
    expect(store.elements).toHaveLength(2)
  })

  // ICT-4: ArrowRight nudges rect AND re-anchors bound arrow endpoint
  it('ArrowRight re-anchors a bound arrow endpoint to the rect new perimeter', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    // Arrow: start unbound at (0, 80), end bound to rect-1
    const startPoint: [number, number] = [0, 80]
    const arrow = makeArrow('arrow-1', [startPoint, [100, 80]], null, { elementId: 'rect-1' })
    state.elements = [rect, arrow]
    state.selectedIds = ['rect-1']

    fireKey('ArrowRight')

    const updatedRect = store.elements.find((e) => e.id === 'rect-1')
    expect((updatedRect as { x: number }).x).toBe(101)

    const rectAtNewX = makeRect('rect-1', 101, 50)
    const expected = boundEndpoint(rectAtNewX, { x: startPoint[0], y: startPoint[1] })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1') as DiagramElement & {
      points: [[number, number], [number, number]]
    }
    expect(updatedArrow).toBeDefined()
    expect(updatedArrow.points[0][0]).toBeCloseTo(startPoint[0], 5)
    expect(updatedArrow.points[0][1]).toBeCloseTo(startPoint[1], 5)
    expect(updatedArrow.points[1][0]).toBeCloseTo(expected.x, 5)
    expect(updatedArrow.points[1][1]).toBeCloseTo(expected.y, 5)
  })

  // ICT-4: Shift+ArrowRight uses step 10 and re-anchors accordingly
  it('Shift+ArrowRight uses step 10 and re-anchors bound arrow endpoint', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    const startPoint: [number, number] = [0, 80]
    const arrow = makeArrow('arrow-1', [startPoint, [100, 80]], null, { elementId: 'rect-1' })
    state.elements = [rect, arrow]
    state.selectedIds = ['rect-1']

    fireKey('ArrowRight', { shiftKey: true })

    const updatedRect = store.elements.find((e) => e.id === 'rect-1')
    expect((updatedRect as { x: number }).x).toBe(110)

    const rectAtNewX = makeRect('rect-1', 110, 50)
    const expected = boundEndpoint(rectAtNewX, { x: startPoint[0], y: startPoint[1] })

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1') as DiagramElement & {
      points: [[number, number], [number, number]]
    }
    expect(updatedArrow.points[1][0]).toBeCloseTo(expected.x, 5)
    expect(updatedArrow.points[1][1]).toBeCloseTo(expected.y, 5)
  })

  // ICT-4: nudge + single undo reverts both shape position and connector endpoint
  it('nudge + undo reverts both shape position and bound arrow endpoint', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    const startPoint: [number, number] = [0, 80]
    const arrow = makeArrow('arrow-1', [startPoint, [100, 80]], null, { elementId: 'rect-1' })
    state.elements = [rect, arrow]
    state.selectedIds = ['rect-1']

    store.pushHistory()

    fireKey('ArrowRight')

    const afterNudgeRect = store.elements.find((e) => e.id === 'rect-1')
    expect((afterNudgeRect as { x: number }).x).toBe(101)

    store.undoAction()

    const afterUndoRect = store.elements.find((e) => e.id === 'rect-1')
    expect((afterUndoRect as { x: number }).x).toBe(100)

    const afterUndoArrow = store.elements.find((e) => e.id === 'arrow-1') as DiagramElement & {
      points: [[number, number], [number, number]]
    }
    expect(afterUndoArrow.points[1][0]).toBeCloseTo(100, 5)
    expect(afterUndoArrow.points[1][1]).toBeCloseTo(80, 5)
  })

  // ICT-4: nudging a shape with no bound connectors works unchanged
  it('nudging a shape with no bound connectors produces no errors and correct position', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    // Arrow with no bindings (neither start nor end bound to rect-1)
    const arrow = makeArrow('arrow-1', [[0, 80], [200, 80]], null, null)
    state.elements = [rect, arrow]
    state.selectedIds = ['rect-1']

    expect(() => fireKey('ArrowRight')).not.toThrow()

    const updatedRect = store.elements.find((e) => e.id === 'rect-1')
    expect((updatedRect as { x: number }).x).toBe(101)

    const updatedArrow = store.elements.find((e) => e.id === 'arrow-1') as DiagramElement & {
      points: [[number, number], [number, number]]
    }
    // Arrow has no bindings, so its points must be unchanged
    expect(updatedArrow.points[0][0]).toBeCloseTo(0, 5)
    expect(updatedArrow.points[1][0]).toBeCloseTo(200, 5)
  })

  // SCN: arrow keys do not move elements when no selection
  it('arrow keys do nothing when selection is empty', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    state.elements = [rect]
    state.selectedIds = []

    fireKey('ArrowRight')

    const el = store.elements.find((e) => e.id === 'rect-1')
    expect((el as { x: number }).x).toBe(100)
  })

  // SCN: arrow keys do nothing when a text input is focused
  it('arrow keys do not nudge when a text input is focused', async () => {
    const { store, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    const rect = makeRect('rect-1', 100, 50)
    state.elements = [rect]
    state.selectedIds = ['rect-1']

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('ArrowRight')

    const el = store.elements.find((e) => e.id === 'rect-1')
    expect((el as { x: number }).x).toBe(100)

    input.blur()
    document.body.removeChild(input)
  })
})
