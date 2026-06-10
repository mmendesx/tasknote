import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTextElement(overrides: Partial<DiagramElement> = {}): DiagramElement {
  return {
    id: 'text-1',
    type: 'text',
    x: 50,
    y: 80,
    text: 'draft',
    fontSize: 16,
    color: 'currentColor',
    ...overrides,
  } as DiagramElement
}

async function mountCanvasWithText(textEl: DiagramElement) {
  const { diagrams: apiDiagrams } = await import('@/api')
  vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
    id: 1,
    title: 'Edit test',
    scene_json: {
      version: 1,
      elements: [textEl],
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

  await flushPromises()

  const storeState = pinia.state.value['diagrams']
  storeState.loading = false
  storeState.loadError = null
  storeState.tool = 'select'
  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState, store: useDiagramsStore(pinia) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramTextEdit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('double-click edits existing text: input visible and prefilled, Enter saves new text at same position', async () => {
    const textEl = makeTextElement({ text: 'draft', x: 50, y: 80 })
    const { wrapper, pinia } = await mountCanvasWithText(textEl)

    const svg = wrapper.find('svg.diagram-canvas')

    // Find the rendered text element with data-element-id
    const textNode = wrapper.find(`[data-element-id="${textEl.id}"]`)
    expect(textNode.exists()).toBe(true)

    // Dispatch a dblclick on the text SVG element
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNode.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    // Input should be visible and pre-filled with existing text
    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('draft')

    // Change text and commit with Enter
    await input.setValue('draft v2')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const updated = elements[0]
    expect(updated.id).toBe(textEl.id)
    expect(updated.text).toBe('draft v2')
    // Position must be unchanged
    expect(updated.x).toBe(50)
    expect(updated.y).toBe(80)
  })

  it('clearing text deletes the element', async () => {
    const textEl = makeTextElement({ text: 'will be deleted' })
    const { wrapper, pinia } = await mountCanvasWithText(textEl)

    const textNode = wrapper.find(`[data-element-id="${textEl.id}"]`)
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNode.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)

    // Clear the input and commit via blur
    await input.setValue('')
    await input.trigger('blur')
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(0)
  })

  it('escape cancels the edit and original element stays unchanged', async () => {
    const textEl = makeTextElement({ text: 'keep' })
    const { wrapper, pinia } = await mountCanvasWithText(textEl)

    const textNode = wrapper.find(`[data-element-id="${textEl.id}"]`)
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNode.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)

    // Type something then press Escape
    await input.setValue('keep something extra')
    await input.trigger('keydown', { key: 'Escape' })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    expect(elements[0].text).toBe('keep')

    // Input should be gone
    const inputAfter = wrapper.find('input.diagram-text-input')
    expect(inputAfter.exists()).toBe(false)
  })

  it('edit is one undo entry: after commit undoAction restores old text', async () => {
    const textEl = makeTextElement({ text: 'original' })
    const { wrapper, pinia, store } = await mountCanvasWithText(textEl)

    const textNode = wrapper.find(`[data-element-id="${textEl.id}"]`)
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNode.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    await input.setValue('updated')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    // Confirm edit was committed
    expect(pinia.state.value['diagrams'].elements[0].text).toBe('updated')

    // Undo should restore original text
    store.undoAction()
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements[0].text).toBe('original')
  })

  it('original text element is hidden while editing', async () => {
    const textEl = makeTextElement({ text: 'hidden during edit' })
    const { wrapper } = await mountCanvasWithText(textEl)

    // Before editing: the SVG text element is in the DOM and visible
    const textNodeBefore = wrapper.find(`text[data-element-id="${textEl.id}"]`)
    expect(textNodeBefore.exists()).toBe(true)
    expect((textNodeBefore.element as SVGTextElement).style.display).not.toBe('none')

    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNodeBefore.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    // During editing: input is visible
    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)

    // The SVG <text> node with data-element-id should be hidden (display:none via v-show)
    // v-show on a multi-root component applies to each root node individually
    const textNodeDuring = wrapper.find(`text[data-element-id="${textEl.id}"]`)
    expect(textNodeDuring.exists()).toBe(true)
    expect((textNodeDuring.element as SVGTextElement).style.display).toBe('none')
  })

  it('text tool still creates new elements (regression)', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Regression',
      scene_json: {
        version: 1,
        elements: [],
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

    await flushPromises()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.loadError = null
    storeState.tool = 'text'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 30, clientY: 30, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    await input.setValue('brand new')
    await input.trigger('blur')
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    expect(elements[0].type).toBe('text')
    expect(elements[0].text).toBe('brand new')
  })

  // ICT-1 acceptance: double-click text edit produces exactly one history entry
  it('double-click edit produces one undo entry: one undo restores original text', async () => {
    const textEl = makeTextElement({ text: 'draft', x: 50, y: 80 })
    const { wrapper, pinia, store } = await mountCanvasWithText(textEl)

    const textNode = wrapper.find(`[data-element-id="${textEl.id}"]`)
    expect(textNode.exists()).toBe(true)

    // Simulate realistic interaction: pointerdown+up before dblclick
    await textNode.trigger('pointerdown', { clientX: 60, clientY: 80, pointerId: 1 })
    await textNode.trigger('pointerup', { clientX: 60, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Double-click opens the editor
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    textNode.element.dispatchEvent(dblClickEvent)
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('draft')

    // Edit and commit
    await input.setValue('draft v2')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements[0].text).toBe('draft v2')

    // Exactly one undo entry: restores original text
    store.undoAction()
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements[0].text).toBe('draft')

    // No further undo entries — the bare clicks before dblclick pushed nothing
    expect(store.canUndo).toBe(false)
  })
})
