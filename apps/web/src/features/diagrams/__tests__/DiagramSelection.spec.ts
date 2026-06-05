import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
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

  await flushPromises()

  const storeState = pinia.state.value['diagrams']
  storeState.tool = 'select'
  storeState.loading = false
  storeState.error = null
  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramSelection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('clicking an element selects it and renders a selection outline', async () => {
    const ellipse = makeEllipse('ell-1')
    const { wrapper, pinia } = await mountCanvasWithElements([ellipse])

    // Find any element node with data-element-id="ell-1"
    const elementNode = wrapper.find('[data-element-id="ell-1"]')
    expect(elementNode.exists()).toBe(true)

    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 80, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedId).toBe('ell-1')

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

    expect(pinia.state.value['diagrams'].selectedId).toBe('del-me')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect(elements.find((e) => e.id === 'del-me')).toBeUndefined()
    expect(pinia.state.value['diagrams'].selectedId).toBeNull()
  })

  it('single selection: clicking a second element replaces selection', async () => {
    const elA = makeRect('el-A', 10, 10)
    const elB = makeRect('el-B', 200, 200)
    const { wrapper, pinia } = await mountCanvasWithElements([elA, elB])

    // Select A
    const nodeA = wrapper.find('[data-element-id="el-A"]')
    await nodeA.trigger('pointerdown', { clientX: 60, clientY: 60, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedId).toBe('el-A')

    // Now select B — this triggers pointerdown on el-B's node
    const nodeB = wrapper.find('[data-element-id="el-B"]')
    await nodeB.trigger('pointerdown', { clientX: 250, clientY: 250, pointerId: 1 })
    await wrapper.vm.$nextTick()
    expect(pinia.state.value['diagrams'].selectedId).toBe('el-B')
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
    expect(pinia.state.value['diagrams'].selectedId).toBe('clear-me')

    // Click on SVG directly (no data-element-id on the svg itself)
    const svg = wrapper.find('svg.diagram-canvas')
    await svg.trigger('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedId).toBeNull()
  })
})
