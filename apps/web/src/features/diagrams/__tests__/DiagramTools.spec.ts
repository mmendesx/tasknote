import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import { rdp } from '../useDrawTools'

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

// ── Mount helper ──────────────────────────────────────────────────────────────

async function mountCanvas() {
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
  storeState.error = null
  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramTools', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // BDD: rectangle tool: drag from (10,10) to (110,80) adds a rectangle x10 y10 w100 h70
  it('rectangle tool: drag from (10,10) to (110,80) adds a rectangle x10 y10 w100 h70', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'rectangle'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 60, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 110, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const el = elements[0]
    expect(el.type).toBe('rectangle')
    expect(el.x).toBe(10)
    expect(el.y).toBe(10)
    expect(el.width).toBe(100)
    expect(el.height).toBe(70)
  })

  // BDD: arrow tool: drag (0,0)->(50,0) adds an arrow with points [[0,0],[50,0]]
  it('arrow tool: drag (0,0) to (50,0) adds an arrow with points [[0,0],[50,0]]', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'arrow'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 50, clientY: 0, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const el = elements[0]
    expect(el.type).toBe('arrow')
    expect(el.points).toEqual([[0, 0], [50, 0]])
  })

  // BDD: text tool: click at (20,20) then type 'start' commits a text element text==='start' at (20,20)
  it("text tool: click at (20,20) then type 'start' commits a text element text==='start' at (20,20)", async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'text'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 20, clientY: 20, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input.diagram-text-input')
    expect(input.exists()).toBe(true)
    await input.setValue('start')
    await input.trigger('blur')
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const el = elements[0]
    expect(el.type).toBe('text')
    expect(el.text).toBe('start')
    expect(el.x).toBe(20)
    expect(el.y).toBe(20)
  })

  // BDD: pen tool: collinear stroke is simplified to 2 endpoints by RDP (epsilon=1)
  it('pen tool: collinear stroke is simplified to 2 endpoints after RDP', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'pen'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    // 1 pointerdown (captures point[0]) + 4 pointermoves spaced 10px apart
    // All 5 points lie on the line y = x/2, so RDP simplifies to 2 endpoints
    await svg.trigger('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 10, clientY: 5, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 20, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 30, clientY: 15, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 40, clientY: 20, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 40, clientY: 20, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const el = elements[0]
    expect(el.type).toBe('pen')
    // Collinear points collapse to just the two endpoints
    expect(el.points).toEqual([[0, 0], [40, 20]])
  })

  // BDD: escape during a rectangle drag adds no element
  it('escape during a rectangle drag adds no element', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'rectangle'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const initialLength = pinia.state.value['diagrams'].elements.length

    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 60, clientY: 50, pointerId: 1 })

    // Fire escape on window to cancel
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    // Even if pointerup fires after escape, no element should be added
    await svg.trigger('pointerup', { clientX: 110, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(initialLength)
  })

  // Zero-size guard: a click with near-zero drag does NOT create a rectangle
  it('rectangle tool: near-zero drag does not create an element', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'rectangle'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 51, clientY: 51, pointerId: 1 }) // 1px drag
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(0)
  })

  // Zero-size guard: line tool single click (no drag) creates no element
  it('line tool: a click with no drag (endpoints within MIN_DRAG_PX) creates no element', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'line'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const initialLength = pinia.state.value['diagrams'].elements.length

    await svg.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 50, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements).toHaveLength(initialLength)
  })

  // Zero-size guard: arrow tool single click (no drag) creates no element
  it('arrow tool: a click with no drag creates no element', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'arrow'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const initialLength = pinia.state.value['diagrams'].elements.length

    await svg.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 50, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements).toHaveLength(initialLength)
  })

  // Pan regression: hand tool still works after drawing tool introduction
  it('pan still works with hand tool after drawing tools are introduced', async () => {
    const { wrapper, pinia, storeState } = await mountCanvas()
    storeState.tool = 'hand'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 150, clientY: 90, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 150, clientY: 90, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const { scrollX, scrollY } = pinia.state.value['diagrams'].viewport
    expect(scrollX).toBeCloseTo(100)
    expect(scrollY).toBeCloseTo(60)
  })

  // Regression: the text tool must NOT capture the pointer to the SVG on
  // pointerdown — capture steals focus from the foreignObject <input> so
  // keystrokes never reach it. Click-to-place tools skip capture; drag tools keep it.
  it('text tool does NOT capture the pointer on pointerdown', async () => {
    const { wrapper, storeState } = await mountCanvas()
    storeState.tool = 'text'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const capture = vi.fn()
    ;(svg.element as unknown as { setPointerCapture: typeof capture }).setPointerCapture = capture

    await svg.trigger('pointerdown', { clientX: 40, clientY: 40, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(capture).not.toHaveBeenCalled()
  })

  it('rectangle tool DOES capture the pointer on pointerdown', async () => {
    const { wrapper, storeState } = await mountCanvas()
    storeState.tool = 'rectangle'
    await wrapper.vm.$nextTick()

    const svg = wrapper.find('svg.diagram-canvas')
    const capture = vi.fn()
    ;(svg.element as unknown as { setPointerCapture: typeof capture }).setPointerCapture = capture

    await svg.trigger('pointerdown', { clientX: 40, clientY: 40, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(capture).toHaveBeenCalledTimes(1)
  })
})

// ── RDP unit tests ────────────────────────────────────────────────────────────

describe('rdp', () => {
  it('straight line with 5 collinear points simplifies to 2 endpoints', () => {
    const points: [number, number][] = [
      [0, 0], [25, 0], [50, 0], [75, 0], [100, 0],
    ]
    const result = rdp(points, 1)
    expect(result).toEqual([[0, 0], [100, 0]])
  })

  it('triangle (3-point bend) with epsilon=0 returns all 3 points', () => {
    // The middle point is 50 units away from the line between first and last
    const points: [number, number][] = [[0, 0], [50, 50], [100, 0]]
    const result = rdp(points, 0)
    expect(result).toEqual([[0, 0], [50, 50], [100, 0]])
  })

  it('single point input returns as-is', () => {
    const points: [number, number][] = [[5, 10]]
    const result = rdp(points, 1)
    expect(result).toEqual([[5, 10]])
  })

  it('200-point zigzag with epsilon=1 returns fewer than 200 points', () => {
    // Build a path of 200 points where every 4th point is a zigzag peak/valley
    // and the points in between are collinear (so RDP can drop them).
    // Pattern per 4 points: valley at y=0, mid-slope (collinear), peak at y=20, mid-slope (collinear)
    // The collinear mid-slope points are within epsilon of the chord, so they get dropped.
    const points: [number, number][] = []
    for (let i = 0; i < 200; i++) {
      const cycle = i % 4
      const group = Math.floor(i / 4)
      const baseX = group * 40
      if (cycle === 0) points.push([baseX, 0])
      else if (cycle === 1) points.push([baseX + 10, 10])   // collinear between (0,0) and (20,20)
      else if (cycle === 2) points.push([baseX + 20, 20])   // peak
      else points.push([baseX + 30, 10])                    // collinear between (20,20) and (40,0)
    }
    const result = rdp(points, 1)
    expect(result.length).toBeLessThan(200)
  })
})
