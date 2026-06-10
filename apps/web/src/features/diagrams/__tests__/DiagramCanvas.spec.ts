import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement } from '@tasknote/shared'

// ── API mock: never touches the network ──────────────────────────────────────

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

function makeArrowElement() {
  return {
    id: 'arrow-1',
    type: 'arrow' as const,
    points: [[10, 10], [100, 100]] as [[number, number], [number, number]],
    stroke: '#000000',
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
  return { wrapper, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // SCN-1: pan updates the viewport
  it('pan updates the viewport when tool is hand', async () => {
    const { wrapper, pinia } = await mountCanvas()

    // Set tool to 'hand' via store state
    const storeState = pinia.state.value['diagrams']
    storeState.tool = 'hand'
    storeState.loading = false
    storeState.loadError = null
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    expect(svg.exists()).toBe(true)

    const startX = 50
    const startY = 30
    const endX = 150
    const endY = 90

    // pointerdown → pointermove → pointerup
    await svg.trigger('pointerdown', { clientX: startX, clientY: startY, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: endX, clientY: endY, pointerId: 1 })
    await svg.trigger('pointerup', { pointerId: 1 })

    // zoom=1, so delta is applied 1:1
    // scrollX += (endX - startX) / zoom = 100, scrollY += (endY - startY) / zoom = 60
    const { scrollX, scrollY } = pinia.state.value['diagrams'].viewport
    expect(scrollX).toBeCloseTo(100)
    expect(scrollY).toBeCloseTo(60)
  })

  // SCN-2: zoom is clamped at max (ctrl+wheel triggers zoom)
  it('zoom is clamped at MAX_ZOOM=5', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.loadError = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 4.99 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    // vue-test-utils.trigger() tries Object.assign on the event which fails for read-only
    // properties (clientX, deltaY, etc.) in jsdom. Use a real WheelEvent instead.
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    // 4.99 * 1.1 = 5.489, clamped to exactly 5
    const { zoom } = pinia.state.value['diagrams'].viewport
    expect(zoom).toBe(5)
  })

  // ICT-4: plain wheel (no modifier) pans vertically, zoom unchanged
  it('plain wheel deltaY pans viewport vertically without changing zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.loadError = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const wheelEvent = new WheelEvent('wheel', {
      deltaX: 0,
      deltaY: 100,
      ctrlKey: false,
      metaKey: false,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    const { zoom, scrollX, scrollY } = pinia.state.value['diagrams'].viewport
    // zoom must be unchanged
    expect(zoom).toBe(1)
    // natural direction: scrollY decreases by deltaY/zoom = 100/1 = 100
    expect(scrollY).toBeCloseTo(-100)
    // no horizontal delta → scrollX unchanged
    expect(scrollX).toBe(0)
  })

  // ICT-4: plain wheel deltaX pans viewport horizontally
  it('plain wheel deltaX pans viewport horizontally without changing zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.loadError = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 2 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const wheelEvent = new WheelEvent('wheel', {
      deltaX: 60,
      deltaY: 0,
      ctrlKey: false,
      metaKey: false,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    const { zoom, scrollX, scrollY } = pinia.state.value['diagrams'].viewport
    expect(zoom).toBe(2)
    // scrollX decreases by deltaX/zoom = 60/2 = 30
    expect(scrollX).toBeCloseTo(-30)
    expect(scrollY).toBe(0)
  })

  // ICT-4: ctrl+wheel zooms in (zoom increases) toward cursor
  it('ctrl+wheel with deltaY<0 increases zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.loadError = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    const { zoom } = pinia.state.value['diagrams'].viewport
    // factor 1.1 applied → zoom = 1.1
    expect(zoom).toBeCloseTo(1.1)
  })

  // SCN-3: viewport restored on reopen (g transform reflects saved viewport)
  it('viewport restored on reopen: g transform reflects scrollX/scrollY/zoom', async () => {
    const savedViewport = { scrollX: 200, scrollY: 100, zoom: 1.5 }

    // Stub getDiagram to return the saved viewport
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Restored',
      scene_json: {
        version: 1,
        elements: [],
        appState: { viewport: savedViewport },
      },
    } as never)

    const { wrapper } = await mountCanvas()

    const g = wrapper.find('g')
    expect(g.exists()).toBe(true)

    // transform = translate(scrollX*zoom, scrollY*zoom) scale(zoom)
    // = translate(300, 150) scale(1.5)
    const transform = g.attributes('transform') ?? ''
    expect(transform).toContain('translate(300,150)')
    expect(transform).toContain('scale(1.5)')
  })

  // SCN-4: arrow renders an arrowhead marker
  it('arrow element has marker-end referencing the arrowhead', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Arrow test',
      scene_json: {
        version: 1,
        elements: [makeArrowElement()],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    } as never)

    const { wrapper } = await mountCanvas()

    // Arrow renders as <line> with marker-end
    const lines = wrapper.findAll('line')
    const arrowLine = lines.find(
      (l) => l.attributes('marker-end') === 'url(#diagram-arrowhead)'
    )
    expect(arrowLine).toBeDefined()
    expect(arrowLine!.attributes('marker-end')).toBe('url(#diagram-arrowhead)')
  })

  // SCN-5: load error shows an error state, not a blank canvas
  it('load error shows role=alert and no svg canvas', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockRejectedValueOnce(new Error('Network error'))

    const { wrapper } = await mountCanvas()

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Failed to load diagram')

    const canvas = wrapper.find('svg.diagram-canvas')
    expect(canvas.exists()).toBe(false)
  })

  // ICT-2: failed autosave keeps canvas editable (no error shell, svg stays)
  it('failed autosave keeps canvas mounted and shows no load-error shell', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Save test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'el-save',
            type: 'rectangle' as const,
            x: 0, y: 0, width: 50, height: 50,
            stroke: '#000', fill: null, strokeWidth: 1,
          },
        ],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    } as never)
    vi.mocked(apiDiagrams.updateDiagram).mockRejectedValue(new Error('Network error'))

    const { wrapper, pinia } = await mountCanvas()
    const store = useDiagramsStore(pinia)

    // Trigger a save and let it fail
    store.addElement({
      id: 'el-new', type: 'rectangle', x: 10, y: 10,
      width: 20, height: 20, stroke: '#000', fill: null, strokeWidth: 1,
    })

    // Flush debounce
    const storeState = pinia.state.value['diagrams']
    // Force the debounce to fire by advancing timers is not available here;
    // directly invoke store.save to simulate the failure
    await store.save()
    await flushPromises()

    // Canvas SVG must still be mounted (not replaced by error shell)
    const canvas = wrapper.find('svg.diagram-canvas')
    expect(canvas.exists()).toBe(true)

    // Load-error shell must not be present
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(false)

    // Store state reflects the split
    expect(storeState.saveError).not.toBeNull()
    expect(storeState.loadError).toBeNull()
  })

  // ICT-2: load error still shows the error shell (regression guard)
  it('load error shows role=alert and no svg canvas — loadError isolated', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockRejectedValueOnce(new Error('Server error'))

    const { wrapper, pinia } = await mountCanvas()
    const storeState = pinia.state.value['diagrams']

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Failed to load diagram')

    const canvas = wrapper.find('svg.diagram-canvas')
    expect(canvas.exists()).toBe(false)

    expect(storeState.loadError).not.toBeNull()
    expect(storeState.saveError).toBeNull()
  })

  // ICT-9: pointercancel mid-rect-draw cancels the draw without committing an element
  it('pointercancel mid-rect-draw: preview disappears, state returns to idle, no element committed', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.tool = 'rectangle'
    storeState.loading = false
    storeState.loadError = null
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const initialLength = storeState.elements.length

    // Start a rect draw
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 60, clientY: 50, pointerId: 1 })

    // Dispatch pointercancel to abort the gesture
    await svg.trigger('pointercancel', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    // No element should be committed
    expect(storeState.elements).toHaveLength(initialLength)
    // Preview shape should be gone (rect preview renders as .diagram-preview)
    const previewAfter = wrapper.find('.diagram-preview')
    expect(previewAfter.exists()).toBe(false)
  })

  // ICT-9: pointercancel mid-pan resets isPanning to false
  it('pointercancel mid-pan: isPanning goes false and further moves do not pan', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.tool = 'hand'
    storeState.loading = false
    storeState.loadError = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    // Start panning
    await svg.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })

    // Cancel the gesture
    await svg.trigger('pointercancel', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    // A pointermove after cancel should not move the viewport
    await svg.trigger('pointermove', { clientX: 150, clientY: 90, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const { scrollX, scrollY } = storeState.viewport
    expect(scrollX).toBe(0)
    expect(scrollY).toBe(0)
  })

  // ICT-5: pointercancel mid-move restores position
  it('pointercancel mid-move restores position and leaves no dangling history entry', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Cancel move test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-cancel',
            type: 'rectangle' as const,
            x: 10,
            y: 10,
            width: 80,
            height: 60,
            stroke: '#000',
            fill: null,
            strokeWidth: 1,
          },
        ],
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
    storeState.tool = 'select'
    storeState.loading = false
    storeState.loadError = null
    await wrapper.vm.$nextTick()

    const store = useDiagramsStore(pinia)
    // Establish a previous committed mutation so we can verify undo targets it (not the cancelled drag)
    store.addElement({
      id: 'rect-extra',
      type: 'rectangle',
      x: 300,
      y: 300,
      width: 20,
      height: 20,
      stroke: '#000',
      fill: null,
      strokeWidth: 1,
    })
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const elementNode = wrapper.find('[data-element-id="rect-cancel"]')
    expect(elementNode.exists()).toBe(true)

    // Pointerdown selects and begins move gesture
    await elementNode.trigger('pointerdown', { clientX: 50, clientY: 40, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Two moves apply a +30,+30 delta so the element visibly moves mid-gesture
    await svg.trigger('pointermove', { clientX: 65, clientY: 55, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 80, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Mid-drag the element should be displaced
    const midDragEl = (storeState.elements as DiagramElement[]).find((e) => e.id === 'rect-cancel')
    expect((midDragEl as any).x).toBeGreaterThan(10)

    // Cancel the gesture — must restore original position
    await svg.trigger('pointercancel', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    const afterCancel = (storeState.elements as DiagramElement[]).find((e) => e.id === 'rect-cancel')
    expect(afterCancel).toBeDefined()
    expect((afterCancel as any).x).toBe(10)
    expect((afterCancel as any).y).toBe(10)

    // Undo must target the addElement mutation, not the cancelled drag.
    // After one undo, rect-extra disappears (that was the prior mutation).
    store.undoAction()
    await wrapper.vm.$nextTick()

    const afterUndo = storeState.elements as DiagramElement[]
    expect(afterUndo.find((e) => e.id === 'rect-extra')).toBeUndefined()
    // No further undo entries — cancel pushed no history of its own
    expect(store.canUndo).toBe(false)
  })

  // ICT-5: pointercancel mid-resize restores size
  it('pointercancel mid-resize restores size to pre-gesture values', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Cancel resize test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-resize-cancel',
            type: 'rectangle' as const,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            stroke: '#000',
            fill: null,
            strokeWidth: 1,
          },
        ],
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
    storeState.tool = 'select'
    storeState.loading = false
    storeState.loadError = null
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    // Stub pointer capture so jsdom does not throw
    ;(svg.element as SVGSVGElement).setPointerCapture = vi.fn()

    // Select the rect so resize handles render
    const elementNode = wrapper.find('[data-element-id="rect-resize-cancel"]')
    expect(elementNode.exists()).toBe(true)
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(storeState.selectedIds).toContain('rect-resize-cancel')

    // Start resize via se handle
    const handle = wrapper.find('[data-resize-handle="se"]')
    expect(handle.exists()).toBe(true)
    await handle.trigger('pointerdown', { pointerId: 1, clientX: 150, clientY: 150 })
    await wrapper.vm.$nextTick()

    // Drag toward 175,175 — would produce ~125×125 if committed
    await svg.trigger('pointermove', { clientX: 175, clientY: 175, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Mid-resize the element should have grown
    const midResizeEl = (storeState.elements as DiagramElement[]).find(
      (e) => e.id === 'rect-resize-cancel',
    )
    expect((midResizeEl as any).width).toBeGreaterThan(100)

    // Cancel the gesture — must restore original 100×100
    await svg.trigger('pointercancel', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    const afterCancel = (storeState.elements as DiagramElement[]).find(
      (e) => e.id === 'rect-resize-cancel',
    )
    expect(afterCancel).toBeDefined()
    expect((afterCancel as any).width).toBe(100)
    expect((afterCancel as any).height).toBe(100)
    expect((afterCancel as any).x).toBe(50)
    expect((afterCancel as any).y).toBe(50)
  })

  it('unmounting flushes a pending autosave immediately', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.updateDiagram).mockClear()

    const { wrapper, pinia } = await mountCanvas()
    const store = useDiagramsStore(pinia)

    // Schedule an autosave (debounce not yet elapsed)
    store.addElement({
      id: 'el-unmount',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      stroke: '#000000',
      fill: null,
      strokeWidth: 1,
    })
    expect(apiDiagrams.updateDiagram).not.toHaveBeenCalled()

    // Tearing the canvas down flushes the pending save right away
    wrapper.unmount()
    await flushPromises()

    expect(apiDiagrams.updateDiagram).toHaveBeenCalledTimes(1)
    expect(apiDiagrams.updateDiagram).toHaveBeenCalledWith(1, expect.anything())
  })
})
