import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
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

function makeRectElement(overrides: Partial<DiagramElement> = {}): DiagramElement {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    stroke: 'currentColor',
    strokeWidth: 2,
    ...overrides,
  } as DiagramElement
}

function makeEllipseElement(overrides: Partial<DiagramElement> = {}): DiagramElement {
  return {
    id: 'ellipse-1',
    type: 'ellipse',
    x: 50,
    y: 50,
    width: 160,
    height: 80,
    stroke: 'currentColor',
    strokeWidth: 2,
    ...overrides,
  } as DiagramElement
}

async function mountCanvasWithElement(el: DiagramElement) {
  const { diagrams: apiDiagrams } = await import('@/api')
  vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
    id: 1,
    title: 'Shape label test',
    scene_json: {
      version: 1,
      elements: [el],
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
  storeState.loading = false
  storeState.loadError = null
  storeState.tool = 'select'
  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState, store: useDiagramsStore(pinia) }
}

function dblClickElement(wrapper: VueWrapper, id: string): void {
  const node = wrapper.find(`[data-element-id="${id}"]`)
  expect(node.exists()).toBe(true)
  node.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramShapeLabelEdit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  it('double-click a rectangle with label "Start" opens input pre-filled with "Start"', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Start' })
    const { wrapper } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Start')
  })

  it('double-click a rectangle with no label opens input pre-filled with empty string', async () => {
    const rectEl = makeRectElement({ id: 'rect-1' })
    const { wrapper } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('type "Decision" + Enter on an ellipse sets label and creates one history entry', async () => {
    const ellipseEl = makeEllipseElement({ id: 'ellipse-1' })
    const { wrapper, pinia, store } = await mountCanvasWithElement(ellipseEl)

    dblClickElement(wrapper, 'ellipse-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    await input.setValue('Decision')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    expect(elements[0].label).toBe('Decision')

    // One undo entry restores no label
    store.undoAction()
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements[0].label).toBeUndefined()
  })

  it('Escape after editing leaves label unchanged', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Keep' })
    const { wrapper, pinia } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    await input.setValue('Something else')
    await input.trigger('keydown', { key: 'Escape' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    expect(elements[0].label).toBe('Keep')

    const inputAfter = wrapper.find('input.diagram-text-input')
    expect(inputAfter.exists()).toBe(false)
  })

  it('clear input + Enter on rectangle with label "Old" sets label to "" and keeps the shape', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Old' })
    const { wrapper, pinia } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    // Shape must still exist — shape-label mode never deletes the shape
    expect(elements).toHaveLength(1)
    expect(elements[0].id).toBe('rect-1')
    expect(elements[0].label).toBe('')
  })

  it('whitespace-only input + Enter clears the label (treated as empty)', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Old' })
    const { wrapper, pinia } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    await input.setValue('   ')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    expect(elements[0].label).toBe('')
  })

  // Regression (bug: double-click to add a label did nothing). The select
  // pointerdown used to setPointerCapture immediately; capturing on the first
  // pointerdown of a double-click suppresses the native dblclick that opens the
  // label editor. A bare click (down → up, no move) must NOT capture the pointer.
  it('regression: a bare select-click does NOT capture the pointer (keeps dblclick working)', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Start' })
    const { wrapper } = await mountCanvasWithElement(rectEl)

    const svg = wrapper.find('svg.diagram-canvas').element as SVGElement
    // jsdom doesn't implement pointer capture; install a spy so we can assert on it.
    const captureSpy = vi.fn()
    ;(svg as unknown as { setPointerCapture: unknown }).setPointerCapture = captureSpy

    const node = wrapper.find('[data-element-id="rect-1"]')
    await node.trigger('pointerdown', { clientX: 150, clientY: 150, pointerId: 1 })
    await node.trigger('pointerup', { clientX: 150, clientY: 150, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // No capture on a click that never moved — the dblclick that follows survives.
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('regression: capture IS taken once a drag actually moves the shape', async () => {
    const rectEl = makeRectElement({ id: 'rect-1' })
    const { wrapper } = await mountCanvasWithElement(rectEl)

    const svg = wrapper.find('svg.diagram-canvas').element as SVGElement
    const captureSpy = vi.fn()
    ;(svg as unknown as { setPointerCapture: unknown }).setPointerCapture = captureSpy

    const node = wrapper.find('[data-element-id="rect-1"]')
    await node.trigger('pointerdown', { clientX: 150, clientY: 150, pointerId: 1 })
    // First real move frame: capture is deferred to here.
    await wrapper.find('svg.diagram-canvas').trigger('pointermove', { clientX: 180, clientY: 150, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(captureSpy).toHaveBeenCalledWith(1)
  })

  it('single click on a rectangle selects it and shows no text input', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Click' })
    const { wrapper, pinia } = await mountCanvasWithElement(rectEl)

    const node = wrapper.find(`[data-element-id="rect-1"]`)
    expect(node.exists()).toBe(true)

    await node.trigger('pointerdown', { clientX: 150, clientY: 150, pointerId: 1 })
    await node.trigger('pointerup', { clientX: 150, clientY: 150, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // No text input should be visible
    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(false)

    // The element should be selected
    expect(pinia.state.value['diagrams'].selectedIds).toContain('rect-1')
  })

  // Regression guard (bug 3): double-clicking a shape must NOT select every
  // element on the canvas. (The reported symptom was "double-click selects all
  // as if CTRL+A." This pins the app-selection reading: only the double-clicked
  // shape may end up selected — never all of them.)
  it('regression: double-click does not select all elements', async () => {
    const a = makeRectElement({ id: 'rect-1', label: 'A' })
    const b = makeRectElement({ id: 'rect-2', x: 400, label: 'B' })
    const c = makeEllipseElement({ id: 'ellipse-1', x: 400, y: 300, label: 'C' })

    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'multi',
      scene_json: {
        version: 1,
        elements: [a, b, c],
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
    storeState.loading = false
    storeState.loadError = null
    storeState.tool = 'select'
    await wrapper.vm.$nextTick()

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    const selected = pinia.state.value['diagrams'].selectedIds as string[]
    // Must NOT be all three (that would be the CTRL+A symptom).
    expect(selected.length).toBeLessThan(3)
    expect(selected).not.toContain('rect-2')
    expect(selected).not.toContain('ellipse-1')
  })

  // Regression guard: the shape stays VISIBLE while its label is edited.
  // (editingElId previously hid the element for any text-kind edit, including
  // label mode, so a rectangle vanished while you typed its label.)
  it('regression: shape view stays visible while editing its label', async () => {
    const rectEl = makeRectElement({ id: 'rect-1', label: 'Start' })
    const { wrapper } = await mountCanvasWithElement(rectEl)

    dblClickElement(wrapper, 'rect-1')
    await wrapper.vm.$nextTick()

    // Input is open (we are in label-edit mode)…
    expect(wrapper.find('input.diagram-text-input').exists()).toBe(true)
    // …and the shape itself must NOT be hidden via v-show (display:none).
    const node = wrapper.find('[data-element-id="rect-1"]')
    expect(node.exists()).toBe(true)
    expect((node.element as HTMLElement).style.display).not.toBe('none')
  })

  // Counterpart: a TEXT element IS hidden while edited (input replaces it).
  it('regression: text element view is hidden while editing it', async () => {
    const textEl: DiagramElement = {
      id: 'text-1',
      type: 'text',
      x: 50,
      y: 80,
      text: 'editing',
      fontSize: 16,
      color: 'currentColor',
    } as DiagramElement

    const { wrapper } = await mountCanvasWithElement(textEl)

    dblClickElement(wrapper, 'text-1')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('input.diagram-text-input').exists()).toBe(true)
    const node = wrapper.find('[data-element-id="text-1"]')
    expect(node.exists()).toBe(true)
    expect((node.element as HTMLElement).style.display).toBe('none')
  })

  // Regression guard: existing text-element behavior preserved
  it('regression: double-click text element, clear it, commit deletes the text element', async () => {
    const textEl: DiagramElement = {
      id: 'text-1',
      type: 'text',
      x: 50,
      y: 80,
      text: 'will be deleted',
      fontSize: 16,
      color: 'currentColor',
    } as DiagramElement

    const { wrapper, pinia } = await mountCanvasWithElement(textEl)

    dblClickElement(wrapper, 'text-1')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)

    await input.setValue('')
    await input.trigger('blur')
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(0)
  })
})
