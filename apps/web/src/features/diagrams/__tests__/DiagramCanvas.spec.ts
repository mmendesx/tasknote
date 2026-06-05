import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'

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
    storeState.error = null
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

  // SCN-2: zoom is clamped at max
  it('zoom is clamped at MAX_ZOOM=5', async () => {
    const { wrapper, pinia } = await mountCanvas()

    const storeState = pinia.state.value['diagrams']
    storeState.loading = false
    storeState.error = null
    storeState.viewport = { scrollX: 0, scrollY: 0, zoom: 4.99 }
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    // vue-test-utils.trigger() tries Object.assign on the event which fails for read-only
    // properties (clientX, deltaY, etc.) in jsdom. Use a real WheelEvent instead.
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    })
    svg.element.dispatchEvent(wheelEvent)
    await wrapper.vm.$nextTick()

    // 4.99 * 1.1 = 5.489, clamped to exactly 5
    const { zoom } = pinia.state.value['diagrams'].viewport
    expect(zoom).toBe(5)
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
})
