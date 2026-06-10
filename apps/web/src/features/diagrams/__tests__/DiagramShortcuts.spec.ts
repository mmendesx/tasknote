import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import { useDiagramsStore } from '@/stores/diagrams'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRect(id = 'rect-1', x = 100, y = 50) {
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

async function mountCanvas(diagramId = 1) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(DiagramCanvas, {
    global: { plugins: [pinia] },
    props: { diagramId },
    attachTo: document.body,
  })

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
