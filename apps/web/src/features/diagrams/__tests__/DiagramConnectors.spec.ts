import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// ── SVG pointer-capture stub ──────────────────────────────────────────────────
// jsdom does not implement setPointerCapture on SVGElement. Production code
// guards with `if (target?.setPointerCapture)`, but we add an explicit no-op
// here so the full captured-draw path runs without relying on that guard.
SVGElement.prototype.setPointerCapture = () => {}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Rectangle R: scene coords (0,0) 100×60 → center (50, 30)
const RECT_R: DiagramElement = {
  id: 'R',
  type: 'rectangle',
  x: 0, y: 0, width: 100, height: 60,
  stroke: '#000', strokeWidth: 2,
}

// Ellipse E: scene coords (200,100) 80×40 → center (240, 120)
const ELLIPSE_E: DiagramElement = {
  id: 'E',
  type: 'ellipse',
  x: 200, y: 100, width: 80, height: 40,
  stroke: '#000', strokeWidth: 2,
}

// ── DOM node helpers ──────────────────────────────────────────────────────────

function makeDomNodeWithId(id: string): Element {
  const node = document.createElement('div')
  node.setAttribute('data-element-id', id)
  return node
}

const rNode = makeDomNodeWithId('R')
const eNode = makeDomNodeWithId('E')

// ── Mount helper ──────────────────────────────────────────────────────────────

async function mountCanvasWithShapes(shapes: DiagramElement[]) {
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
  storeState.tool = 'arrow'
  // Seed store elements so resolveShapeIdAtPoint can look up shapes.
  // We mutate via pinia state to bypass any API round-trip.
  storeState.elements = [...shapes]

  await wrapper.vm.$nextTick()

  return { wrapper, pinia, storeState }
}

// ── elementFromPoint stub management ─────────────────────────────────────────

function stubElementFromPoint(fn: (x: number, y: number) => Element | null): void {
  document.elementFromPoint = fn
}

afterEach(() => {
  // Restore jsdom's original (undefined) state so tests remain independent.
  // @ts-expect-error — jsdom has no real elementFromPoint
  delete document.elementFromPoint
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramConnectors — arrow binding on draw (captured-pointer path)', () => {

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // BDD: arrow start-over-R end-over-E → binds both, points = centers
  it('arrow drawn start-over-R end-over-E binds both ends and anchors to centers', async () => {
    // Start client coords land on R; end client coords land on E.
    // The stub discriminates by x so the start/end resolution is unambiguous.
    stubElementFromPoint((x) => x < 100 ? rNode : eNode)

    const { wrapper, pinia, storeState } = await mountCanvasWithShapes([RECT_R, ELLIPSE_E])
    const svg = wrapper.find('svg.diagram-canvas')

    // Dispatch on the SVG (captured-pointer path) — not on the shape nodes.
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 220, clientY: 120, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 220, clientY: 120, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    // The two seed shapes plus the new arrow.
    const arrow = elements.find((el: DiagramElement) => el.type === 'arrow')
    expect(arrow).toBeDefined()
    expect(arrow.startBinding).toEqual({ elementId: 'R' })
    expect(arrow.endBinding).toEqual({ elementId: 'E' })
    // Points must be anchored to the shape centers in scene coords.
    // RECT_R center = (50, 30), ELLIPSE_E center = (240, 120).
    expect(arrow.points[0]).toEqual([50, 30])
    expect(arrow.points[1]).toEqual([240, 120])
  })

  // BDD: arrow start-over-R, end on empty canvas → startBinding R, endBinding null
  it('arrow drawn start-over-R end-on-empty has startBinding R and endBinding null', async () => {
    // Start lands on R; end returns null (empty canvas).
    stubElementFromPoint((x) => x < 100 ? rNode : null)

    const { wrapper, pinia } = await mountCanvasWithShapes([RECT_R, ELLIPSE_E])
    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 400, clientY: 400, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    const arrow = elements.find((el: DiagramElement) => el.type === 'arrow')
    expect(arrow).toBeDefined()
    expect(arrow.startBinding).toEqual({ elementId: 'R' })
    expect(arrow.endBinding).toBeNull()
    // Start is center of R; end is raw scene point of released pointer.
    expect(arrow.points[0]).toEqual([50, 30])
    // End is NOT the center of any shape; it is the raw getScenePt result.
    // With zoom=1 and scrollX/Y=0 the scene point equals the client point.
    expect(arrow.points[1]).toEqual([400, 400])
  })

  // BDD: FR-4 — both ends on same shape R → created (zero-length exemption), both bindings R
  it('arrow with both ends over the same shape R is created (zero-length exemption) with both bindings R', async () => {
    // Both start and end return rNode.
    stubElementFromPoint(() => rNode)

    const { wrapper, pinia } = await mountCanvasWithShapes([RECT_R])
    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    // No pointermove — start and end coincide (same shape center → zero length).
    await svg.trigger('pointerup', { clientX: 10, clientY: 10, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    const arrow = elements.find((el: DiagramElement) => el.type === 'arrow')
    // Must be created despite zero length because at least one binding is non-null.
    expect(arrow).toBeDefined()
    expect(arrow.startBinding).toEqual({ elementId: 'R' })
    expect(arrow.endBinding).toEqual({ elementId: 'R' })
    // Both points are the center of R.
    expect(arrow.points[0]).toEqual([50, 30])
    expect(arrow.points[1]).toEqual([50, 30])
  })

  // BDD: free arrow over empty canvas → both bindings null, normal arrow
  it('free arrow over empty canvas has both bindings null and is created normally', async () => {
    // No shapes under either endpoint.
    stubElementFromPoint(() => null)

    const { wrapper, pinia } = await mountCanvasWithShapes([])
    const svg = wrapper.find('svg.diagram-canvas')

    await svg.trigger('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 60, clientY: 0, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements
    expect(elements).toHaveLength(1)
    const arrow = elements[0]
    expect(arrow.type).toBe('arrow')
    expect(arrow.startBinding).toBeNull()
    expect(arrow.endBinding).toBeNull()
    expect(arrow.points).toEqual([[0, 0], [60, 0]])
  })

  // BDD: free arrow zero-length (both bindings null) is still rejected by MIN_DRAG_PX
  it('free arrow with zero-length drag over empty canvas is rejected by MIN_DRAG_PX', async () => {
    stubElementFromPoint(() => null)

    const { wrapper, pinia } = await mountCanvasWithShapes([])
    const svg = wrapper.find('svg.diagram-canvas')
    const initialCount = pinia.state.value['diagrams'].elements.length

    await svg.trigger('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 50, clientY: 50, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].elements).toHaveLength(initialCount)
  })

})
