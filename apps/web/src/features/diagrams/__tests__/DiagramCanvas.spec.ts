import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
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

// ── Mount tracking ────────────────────────────────────────────────────────────

const _mountedWrappers: VueWrapper[] = []

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
  _mountedWrappers.push(wrapper)

  await flushPromises()
  return { wrapper, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
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
    _mountedWrappers.push(wrapper)
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
    _mountedWrappers.push(wrapper)
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

  // ICT-12: handles visibility matrix
  it('single selected rect renders 8 bbox handle groups; two selected renders zero; selected arrow renders 2 endpoint handles; selected pen renders zero handles', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    const rectA: import('@tasknote/shared').DiagramElement = {
      id: 'rect-a',
      type: 'rectangle',
      x: 10, y: 10, width: 80, height: 60,
      stroke: '#000', fill: null, strokeWidth: 2,
    }
    const rectB: import('@tasknote/shared').DiagramElement = {
      id: 'rect-b',
      type: 'rectangle',
      x: 200, y: 10, width: 80, height: 60,
      stroke: '#000', fill: null, strokeWidth: 2,
    }
    const arrowEl: import('@tasknote/shared').DiagramElement = {
      id: 'arrow-1',
      type: 'arrow',
      points: [[10, 10], [100, 100]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
    }
    const penEl: import('@tasknote/shared').DiagramElement = {
      id: 'pen-1',
      type: 'pen',
      points: [[0, 0], [50, 50], [100, 0]],
      stroke: '#000', strokeWidth: 2,
    }

    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Handles test',
      scene_json: {
        version: 1,
        elements: [rectA, rectB, arrowEl, penEl],
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

    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    await wrapper.vm.$nextTick()

    // Case 1: single rect selected → 8 bbox handle groups
    state.selectedIds = ['rect-a']
    await wrapper.vm.$nextTick()
    const handleGroups1 = wrapper.findAll('g[data-resize-handle]')
    expect(handleGroups1).toHaveLength(8)

    // Case 2: two rects selected → zero handle groups (multi-select hides handles)
    state.selectedIds = ['rect-a', 'rect-b']
    await wrapper.vm.$nextTick()
    const handleGroups2 = wrapper.findAll('g[data-resize-handle]')
    expect(handleGroups2).toHaveLength(0)

    // Case 3: single arrow selected → 2 endpoint handles
    state.selectedIds = ['arrow-1']
    await wrapper.vm.$nextTick()
    const handleGroups3 = wrapper.findAll('g[data-resize-handle]')
    expect(handleGroups3).toHaveLength(2)

    // Case 4: single pen selected → zero handles (pen is skipped entirely)
    state.selectedIds = ['pen-1']
    await wrapper.vm.$nextTick()
    const handleGroups4 = wrapper.findAll('g[data-resize-handle]')
    expect(handleGroups4).toHaveLength(0)
  })

  // ICT-12: ctrl+wheel keeps the cursor's scene point fixed
  it('ctrl+wheel keeps the cursor scene point fixed after zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    // Mock getBoundingClientRect so getScenePoint knows the SVG origin
    const svgRect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }
    vi.spyOn(svg.element, 'getBoundingClientRect').mockReturnValue(svgRect as DOMRect)

    // Cursor at screen (200, 150) — at zoom=1, scrollX=0, scrollY=0 → scene (200, 150)
    const cursorClientX = 200
    const cursorClientY = 150
    const initialZoom = state.viewport.zoom
    const initialScrollX = state.viewport.scrollX
    const initialScrollY = state.viewport.scrollY
    // scene point = clientX - rect.left) / zoom - scrollX
    const sceneBeforeX = (cursorClientX - svgRect.left) / initialZoom - initialScrollX
    const sceneBeforeY = (cursorClientY - svgRect.top) / initialZoom - initialScrollY

    // Zoom in with ctrl+wheel at cursor position
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: cursorClientX,
      clientY: cursorClientY,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    const { zoom: newZoom, scrollX: newScrollX, scrollY: newScrollY } = pinia.state.value['diagrams'].viewport

    // The cursor scene point must be the same after zoom
    const sceneAfterX = (cursorClientX - svgRect.left) / newZoom - newScrollX
    const sceneAfterY = (cursorClientY - svgRect.top) / newZoom - newScrollY

    expect(sceneAfterX).toBeCloseTo(sceneBeforeX, 3)
    expect(sceneAfterY).toBeCloseTo(sceneBeforeY, 3)
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

  // ── Fix 1: stroke-width constant (no double compensation) ────────────────

  it('selection outline has stroke-width="1" at non-unity zoom (zoom 2)', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Stroke-width test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-sw',
            type: 'rectangle' as const,
            x: 50, y: 50, width: 100, height: 80,
            stroke: '#000', fill: null, strokeWidth: 2,
          },
        ],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 2 } },
      },
    } as never)

    const { wrapper, pinia } = await mountCanvas()
    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    state.selectedIds = ['rect-sw']
    await wrapper.vm.$nextTick()

    const outline = wrapper.find('.diagram-selection-outline')
    expect(outline.exists()).toBe(true)
    // Must be constant 1, not 1/zoom (0.5 at zoom 2)
    expect(outline.attributes('stroke-width')).toBe('1')
  })

  it('marquee has stroke-width="1" at non-unity zoom (zoom 2)', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 2 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 80, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const marquee = wrapper.find('.diagram-marquee')
    expect(marquee.exists()).toBe(true)
    // Must be constant 1, not 1/zoom (0.5 at zoom 2)
    expect(marquee.attributes('stroke-width')).toBe('1')

    await svg.trigger('pointerup', { pointerId: 1 })
  })

  // ── ICT-6: Selection chrome refinement ────────────────────────────────────

  it('ICT-6: selection outline is solid — no stroke-dasharray attribute', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Outline test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-outline',
            type: 'rectangle' as const,
            x: 50, y: 50, width: 100, height: 80,
            stroke: '#000', fill: null, strokeWidth: 2,
          },
        ],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    } as never)

    const { wrapper, pinia } = await mountCanvas()
    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    state.selectedIds = ['rect-outline']
    await wrapper.vm.$nextTick()

    const outline = wrapper.find('.diagram-selection-outline')
    expect(outline.exists()).toBe(true)
    // Must be solid — no dasharray
    expect(outline.attributes('stroke-dasharray')).toBeUndefined()
    // Must have accent stroke
    const stroke = outline.attributes('stroke') ?? ''
    expect(stroke).toContain('--color-accent')
  })

  it('ICT-6: marquee has accent-tinted fill and solid border — no stroke-dasharray', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    // Trigger a marquee drag on empty canvas
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 80, clientY: 70, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const marquee = wrapper.find('.diagram-marquee')
    expect(marquee.exists()).toBe(true)

    // Solid border — no dasharray
    expect(marquee.attributes('stroke-dasharray')).toBeUndefined()

    // Must have a fill (accent-tinted, not 'none')
    const fill = marquee.attributes('fill') ?? ''
    expect(fill).not.toBe('none')
    expect(fill.length).toBeGreaterThan(0)

    // Must have accent stroke
    const stroke = marquee.attributes('stroke') ?? ''
    expect(stroke).toContain('--color-accent')

    // Clean up marquee
    await svg.trigger('pointerup', { pointerId: 1 })
  })

  it('ICT-6: hover outline appears on pointermove over element under select tool', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Hover test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-hover',
            type: 'rectangle' as const,
            x: 0, y: 0, width: 100, height: 80,
            stroke: '#000', fill: null, strokeWidth: 2,
          },
        ],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    } as never)

    const { wrapper, pinia } = await mountCanvas()
    const state = pinia.state.value['diagrams']
    state.tool = 'select'
    state.loading = false
    state.loadError = null
    state.selectedIds = []
    await wrapper.vm.$nextTick()

    // No hover outline initially
    expect(wrapper.find('.diagram-hover-outline').exists()).toBe(false)

    // Trigger pointermove from the element node — it bubbles to the SVG canvas handler.
    // vue-test-utils sets the event target to the element, which is what onHoverPointerMove reads.
    const elementNode = wrapper.find('[data-element-id="rect-hover"]')
    expect(elementNode.exists()).toBe(true)

    await elementNode.trigger('pointermove', { clientX: 50, clientY: 40, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const hoverOutline = wrapper.find('.diagram-hover-outline')
    expect(hoverOutline.exists()).toBe(true)
    // Hover outline must have accent stroke at lower opacity
    const stroke = hoverOutline.attributes('stroke') ?? ''
    expect(stroke).toContain('--color-accent')
    const opacity = Number(hoverOutline.attributes('opacity') ?? '1')
    expect(opacity).toBeLessThan(1)
  })

  // ── ICT-7: Dot-grid canvas background ────────────────────────────────────────

  it('ICT-7: dot-grid pattern and rect are rendered on the canvas', async () => {
    const { wrapper } = await mountCanvas()

    // The <pattern> definition must exist
    const pattern = wrapper.find('pattern#diagram-dot-grid')
    expect(pattern.exists()).toBe(true)

    // The grid rect must be present and filled with the pattern
    const gridRect = wrapper.find('rect.diagram-dot-grid')
    expect(gridRect.exists()).toBe(true)
    expect(gridRect.attributes('fill')).toBe('url(#diagram-dot-grid)')

    // Must never intercept pointer events
    expect(gridRect.attributes('pointer-events')).toBe('none')
  })

  it('ICT-7: dot-grid rect is hidden below 40% zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null

    // At 39% zoom the grid must not render
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 0.39 }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('rect.diagram-dot-grid').exists()).toBe(false)
  })

  it('ICT-7: dot-grid rect is visible at 100% zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('rect.diagram-dot-grid').exists()).toBe(true)
  })

  it('ICT-7: dot-grid rect is visible at exactly 40% zoom (boundary)', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 0.4 }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('rect.diagram-dot-grid').exists()).toBe(true)
  })

  it('ICT-7: patternTransform reflects viewport offset and zoom', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const state = pinia.state.value['diagrams']
    state.loading = false
    state.loadError = null
    state.viewport = { scrollX: 50, scrollY: 30, zoom: 2 }
    await wrapper.vm.$nextTick()

    const pattern = wrapper.find('pattern#diagram-dot-grid')
    expect(pattern.exists()).toBe(true)

    // patternTransform = translate(scrollX*zoom, scrollY*zoom) scale(zoom)
    // = translate(100, 60) scale(2)
    const pt = pattern.attributes('patterntransform') ?? pattern.attributes('patternTransform') ?? ''
    expect(pt).toContain('translate(100,60)')
    expect(pt).toContain('scale(2)')
  })

  it('ICT-7: dot-grid pattern contains a circle dot element', async () => {
    const { wrapper } = await mountCanvas()

    const pattern = wrapper.find('pattern#diagram-dot-grid')
    expect(pattern.exists()).toBe(true)

    const dot = pattern.find('circle')
    expect(dot.exists()).toBe(true)
    // Dot should be small
    const r = Number(dot.attributes('r') ?? '0')
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(3)
  })

  it('ICT-7: hover outline does not appear under draw tools (rectangle tool)', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
      id: 1,
      title: 'Hover draw tool test',
      scene_json: {
        version: 1,
        elements: [
          {
            id: 'rect-no-hover',
            type: 'rectangle' as const,
            x: 0, y: 0, width: 100, height: 80,
            stroke: '#000', fill: null, strokeWidth: 2,
          },
        ],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    } as never)

    const { wrapper, pinia } = await mountCanvas()
    const state = pinia.state.value['diagrams']
    state.tool = 'rectangle'
    state.loading = false
    state.loadError = null
    await wrapper.vm.$nextTick()

    const elementNode = wrapper.find('[data-element-id="rect-no-hover"]')

    // Trigger pointermove from the element node — bubbles to SVG canvas handler
    await elementNode.trigger('pointermove', { clientX: 50, clientY: 40, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // No hover outline under draw tools
    expect(wrapper.find('.diagram-hover-outline').exists()).toBe(false)
  })
})
