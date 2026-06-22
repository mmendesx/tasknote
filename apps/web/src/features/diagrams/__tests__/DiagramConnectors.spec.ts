import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramCanvas from '../DiagramCanvas.vue'
import type { DiagramElement } from '@tasknote/shared'
import { useDiagramsStore } from '@/stores/diagrams'
import { elementCenter } from '../connectors'
import { facingSideAnchor } from '../orthogonalRoute'

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
let _originalSetPointerCapture: typeof SVGElement.prototype.setPointerCapture

beforeAll(() => {
  _originalSetPointerCapture = SVGElement.prototype.setPointerCapture
  SVGElement.prototype.setPointerCapture = () => {}
})

afterAll(() => {
  SVGElement.prototype.setPointerCapture = _originalSetPointerCapture
})

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

const _mountedWrappers: VueWrapper[] = []

async function mountCanvasWithShapes(shapes: DiagramElement[]) {
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

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  // BDD: arrow start-over-R end-over-E → binds both, points = boundary edge points (ICT-12)
  it('arrow drawn start-over-R end-over-E binds both ends and anchors to shape boundaries', async () => {
    // Start client coords land on R; end client coords land on E.
    // The stub discriminates by x so the start/end resolution is unambiguous.
    stubElementFromPoint((x) => x < 100 ? rNode : eNode)

    const { wrapper, pinia } = await mountCanvasWithShapes([RECT_R, ELLIPSE_E])
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
    // spec-20: Points are facing-side midpoints (GAP=0), not ray-to-edge.
    // start = facingSideAnchor(RECT_R, toward E center (240,120)) → right side → (100, 30)
    // end = facingSideAnchor(ELLIPSE_E, toward R center (50,30)) → left side → (200, 120)
    expect(arrow.points[0]).toEqual([100, 30])
    expect(arrow.points[1]).toEqual([200, 120])
  })

  // Regression (bug: an arrow end released near an ellipse's bbox corner did not
  // bind, so it never followed the ellipse on move). The draw-commit path now
  // resolves bindings geometrically via findShapeAtScenePoint (bbox containment),
  // NOT document.elementFromPoint — so NO elementFromPoint stub is installed here:
  // if the draw path regressed to the DOM resolver, jsdom returns null and the
  // end would not bind, failing this test.
  it('arrow drawn ending on an ellipse bbox corner binds the end (geometric resolver)', async () => {
    const { wrapper, pinia } = await mountCanvasWithShapes([RECT_R, ELLIPSE_E])
    const svg = wrapper.find('svg.diagram-canvas')

    // Start inside R (scene 50,30), end at ELLIPSE_E's bbox corner (201,101):
    // inside bbox (200..280, 100..140) but outside the ellipse curve.
    await svg.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 201, clientY: 101, pointerId: 1 })
    await svg.trigger('pointerup', { clientX: 201, clientY: 101, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const arrow = pinia.state.value['diagrams'].elements.find(
      (el: DiagramElement) => el.type === 'arrow',
    )
    expect(arrow).toBeDefined()
    expect(arrow.startBinding).toEqual({ elementId: 'R' })
    expect(arrow.endBinding).toEqual({ elementId: 'E' })
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
    // spec-20: Start is facing-side midpoint of R toward rawEnd=(400,400).
    // |dy|>|dx| from R center (50,30) → bottom side → (50, 60+GAP) = (50, 60)
    expect(arrow.points[0]).toEqual([50, 60])
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
    // spec-20: degenerate self-bind — facingSideAnchor toward own center (adx==ady==0)
    // resolves to the right side for both ends. No crash; exact side is arbitrary here.
    expect(arrow.points[0]).toEqual([100, 30])
    expect(arrow.points[1]).toEqual([100, 30])
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

// ── ICT-3: bound connector re-anchor during shape drag ─────────────────────────

async function mountCanvasWithElements(elements: DiagramElement[]) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const { diagrams: apiDiagrams } = await import('@/api')
  vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
    id: 1,
    title: 'Reanchor test',
    scene_json: {
      version: 1,
      elements,
      appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
    },
  } as never)

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

  return { wrapper, pinia, storeState, store: useDiagramsStore(pinia) }
}

describe('ICT-3: bound connector re-anchors live during shape drag', () => {

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  // AC-1: drag a bound shape — arrow endpoint anchors to NEW position, not old.
  it('dragging a bound shape re-anchors the arrow endpoint to the new position', async () => {
    // Rect R at (0,0) 100×60. Arrow: unbound start at (200, 30), end bound to R.
    // Initial bound end: boundEndpoint(R_old, from=(200,30)) = R's right edge x=104, y=30.
    // After dragging R by dx=50 → R is at (50,0).
    // Expected new end: boundEndpoint(R_new=(50,0 100x60), from=(200,30)) = x=154, y=30.
    const rectR: DiagramElement = {
      id: 'R', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    // Place initial bound end at the old anchor so we can verify it changes.
    const arrowA: DiagramElement = {
      id: 'A', type: 'arrow',
      points: [[200, 30], [104, 30]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: { elementId: 'R' },
    }

    const { wrapper, pinia } = await mountCanvasWithElements([rectR, arrowA])
    const svg = wrapper.find('svg.diagram-canvas')
    const rectNode = wrapper.find('[data-element-id="R"]')
    expect(rectNode.exists()).toBe(true)

    // pointerdown on the rect node → selects it and starts move gesture
    await rectNode.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    // pointermove +50px at zoom=1 → dxScene=50, dyScene=0
    await svg.trigger('pointermove', { clientX: 100, clientY: 30, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rNew = elements.find((e) => e.id === 'R') as any
    const arrowNew = elements.find((e) => e.id === 'A') as any

    // Shape moved to (50, 0)
    expect(rNew.x).toBeCloseTo(50, 5)

    // Compute expected endpoint: R at new position (50,0) 100×60
    const rNewEl = { ...rectR, x: 50, y: 0 }
    const otherEnd = { x: 200, y: 30 } // unbound start — unchanged
    const expected = facingSideAnchor(rNewEl, [otherEnd.x, otherEnd.y])

    expect(arrowNew.points[1][0]).toBeCloseTo(expected[0], 5)
    expect(arrowNew.points[1][1]).toBeCloseTo(expected[1], 5)

    // Verify it differs from the OLD anchor (guards against stale-position pass)
    const rOldEl = { ...rectR }
    const oldExpected = facingSideAnchor(rOldEl, [otherEnd.x, otherEnd.y])
    expect(expected[0]).not.toBeCloseTo(oldExpected[0], 2)

    await svg.trigger('pointerup', { pointerId: 1 })
  })

  // AC-2: group move of both shapes an arrow binds — both endpoints re-anchor.
  it('group move re-anchors both endpoints when both bound shapes move together', async () => {
    // A at (0,0) 100×60, B at (300,0) 100×60. Arrow bound A→B.
    const shapeA: DiagramElement = {
      id: 'A', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    const shapeB: DiagramElement = {
      id: 'B', type: 'rectangle', x: 300, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    // Initial anchors: start on A right edge toward B center (350,30) = (104,30),
    // end on B left edge toward A center (50,30) = (296,30).
    const arrowAB: DiagramElement = {
      id: 'AB', type: 'arrow',
      points: [[104, 30], [296, 30]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: { elementId: 'A' },
      endBinding: { elementId: 'B' },
    }

    const { wrapper, pinia, storeState } = await mountCanvasWithElements([shapeA, shapeB, arrowAB])
    const svg = wrapper.find('svg.diagram-canvas')

    // Select both shapes before pointerdown so both move.
    storeState.selectedIds = ['A', 'B']
    await wrapper.vm.$nextTick()

    const nodeA = wrapper.find('[data-element-id="A"]')
    expect(nodeA.exists()).toBe(true)
    // pointerdown on A (already selected) → group move begins
    await nodeA.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    // Move +100 in x → dxScene=100
    await svg.trigger('pointermove', { clientX: 150, clientY: 30, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const aMoved = elements.find((e) => e.id === 'A') as any
    const bMoved = elements.find((e) => e.id === 'B') as any
    const arrowMoved = elements.find((e) => e.id === 'AB') as any

    expect(aMoved.x).toBeCloseTo(100, 5) // 0+100
    expect(bMoved.x).toBeCloseTo(400, 5) // 300+100

    const aNewEl = { ...shapeA, x: 100, y: 0 }
    const bNewEl = { ...shapeB, x: 400, y: 0 }
    const bCenter = elementCenter(bNewEl)
    const aCenter = elementCenter(aNewEl)
    const expectedStart = facingSideAnchor(aNewEl, [bCenter.x, bCenter.y])
    const expectedEnd = facingSideAnchor(bNewEl, [aCenter.x, aCenter.y])

    expect(arrowMoved.points[0][0]).toBeCloseTo(expectedStart[0], 5)
    expect(arrowMoved.points[0][1]).toBeCloseTo(expectedStart[1], 5)
    expect(arrowMoved.points[1][0]).toBeCloseTo(expectedEnd[0], 5)
    expect(arrowMoved.points[1][1]).toBeCloseTo(expectedEnd[1], 5)

    await svg.trigger('pointerup', { pointerId: 1 })
  })

  // AC-3: only the start-bound shape moves — bound start re-anchors, unbound end unchanged.
  it('dragging only the start-bound shape re-anchors that end while the other stays unchanged', async () => {
    // R at (0,0) 100×60. Arrow: start bound to R, end free at (200, 30).
    const rectR: DiagramElement = {
      id: 'R', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    const arrowA: DiagramElement = {
      id: 'A', type: 'arrow',
      points: [[104, 30], [200, 30]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: { elementId: 'R' },
      endBinding: null,
    }

    const { wrapper, pinia } = await mountCanvasWithElements([rectR, arrowA])
    const svg = wrapper.find('svg.diagram-canvas')
    const rectNode = wrapper.find('[data-element-id="R"]')
    expect(rectNode.exists()).toBe(true)

    await rectNode.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    // Move +80 in x → dxScene=80
    await svg.trigger('pointermove', { clientX: 130, clientY: 30, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rMoved = elements.find((e) => e.id === 'R') as any
    const arrowMoved = elements.find((e) => e.id === 'A') as any

    expect(rMoved.x).toBeCloseTo(80, 5)

    const rNewEl = { ...rectR, x: 80, y: 0 }
    const freeEnd = { x: 200, y: 30 }
    const expectedStart = facingSideAnchor(rNewEl, [freeEnd.x, freeEnd.y])

    // Bound start re-anchored
    expect(arrowMoved.points[0][0]).toBeCloseTo(expectedStart[0], 5)
    expect(arrowMoved.points[0][1]).toBeCloseTo(expectedStart[1], 5)

    // Free end unchanged
    expect(arrowMoved.points[1][0]).toBeCloseTo(200, 5)
    expect(arrowMoved.points[1][1]).toBeCloseTo(30, 5)

    await svg.trigger('pointerup', { pointerId: 1 })
  })

  // AC-4: move + undo once → shape AND connector both revert (single history entry).
  it('undo after a drag reverts both the shape position and the connector endpoint in one step', async () => {
    const rectR: DiagramElement = {
      id: 'R', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    const arrowA: DiagramElement = {
      id: 'A', type: 'arrow',
      points: [[200, 30], [104, 30]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: { elementId: 'R' },
    }

    const { wrapper, pinia, store } = await mountCanvasWithElements([rectR, arrowA])
    const svg = wrapper.find('svg.diagram-canvas')
    const rectNode = wrapper.find('[data-element-id="R"]')

    await rectNode.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 100, clientY: 30, pointerId: 1 })
    await svg.trigger('pointerup', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Verify the shape actually moved before undoing
    const elementsMoved = pinia.state.value['diagrams'].elements as DiagramElement[]
    expect((elementsMoved.find((e) => e.id === 'R') as any).x).toBeCloseTo(50, 5)

    // Undo exactly once
    store.undoAction()
    await wrapper.vm.$nextTick()

    const elementsAfterUndo = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rReverted = elementsAfterUndo.find((e) => e.id === 'R') as any
    const arrowReverted = elementsAfterUndo.find((e) => e.id === 'A') as any

    // Shape reverts to original position
    expect(rReverted.x).toBeCloseTo(0, 5)
    expect(rReverted.y).toBeCloseTo(0, 5)

    // Connector endpoint reverts to original anchor
    expect(arrowReverted.points[1][0]).toBeCloseTo(104, 5)
    expect(arrowReverted.points[1][1]).toBeCloseTo(30, 5)
  })

  // AC-5: free connector not selected near dragged shape remains unchanged.
  it('a free connector with no bindings is unaffected by a nearby shape drag', async () => {
    const rectR: DiagramElement = {
      id: 'R', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    // Free arrow — no bindings, sits near R
    const freeArrow: DiagramElement = {
      id: 'F', type: 'arrow',
      points: [[10, 10], [90, 50]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: null,
    }

    const { wrapper, pinia } = await mountCanvasWithElements([rectR, freeArrow])
    const svg = wrapper.find('svg.diagram-canvas')
    const rectNode = wrapper.find('[data-element-id="R"]')

    await rectNode.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 100, clientY: 30, pointerId: 1 })
    await wrapper.vm.$nextTick()

    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const freeArrowAfter = elements.find((e) => e.id === 'F') as any

    // Free arrow points must be unchanged
    expect(freeArrowAfter.points[0][0]).toBeCloseTo(10, 5)
    expect(freeArrowAfter.points[0][1]).toBeCloseTo(10, 5)
    expect(freeArrowAfter.points[1][0]).toBeCloseTo(90, 5)
    expect(freeArrowAfter.points[1][1]).toBeCloseTo(50, 5)

    await svg.trigger('pointerup', { pointerId: 1 })
  })

  // Regression (bug 1): moving a bound shape TWICE must keep the binding and
  // re-anchor every time. A redundant points-only re-anchor in the move handler
  // used to trip the store's connector-detach guard, nulling the binding after
  // the first move so the connector stopped following on the second.
  it('dragging a bound shape twice keeps the binding and re-anchors each time', async () => {
    const rectR: DiagramElement = {
      id: 'R', type: 'rectangle', x: 0, y: 0, width: 100, height: 60,
      stroke: '#000', strokeWidth: 2,
    }
    const arrowA: DiagramElement = {
      id: 'A', type: 'arrow',
      points: [[200, 30], [104, 30]] as [[number, number], [number, number]],
      stroke: '#000', strokeWidth: 2,
      startBinding: null,
      endBinding: { elementId: 'R' },
    }

    const { wrapper, pinia } = await mountCanvasWithElements([rectR, arrowA])
    const svg = wrapper.find('svg.diagram-canvas')
    const rectNode = wrapper.find('[data-element-id="R"]')
    const otherEnd = { x: 200, y: 30 } // unbound start — never moves

    // ── Move #1: drag R +50px ──
    await rectNode.trigger('pointerdown', { clientX: 50, clientY: 30, pointerId: 1 })
    await svg.trigger('pointermove', { clientX: 100, clientY: 30, pointerId: 1 })
    await svg.trigger('pointerup', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    let elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    let arrowNew = elements.find((e) => e.id === 'A') as any
    // Binding must survive the first move.
    expect(arrowNew.endBinding).toEqual({ elementId: 'R' })
    let expected = facingSideAnchor({ ...rectR, x: 50, y: 0 }, [otherEnd.x, otherEnd.y])
    expect(arrowNew.points[1][0]).toBeCloseTo(expected[0], 5)

    // ── Move #2: drag R another +50px (now at x=100) ──
    const rectNode2 = wrapper.find('[data-element-id="R"]')
    await rectNode2.trigger('pointerdown', { clientX: 100, clientY: 30, pointerId: 2 })
    await svg.trigger('pointermove', { clientX: 150, clientY: 30, pointerId: 2 })
    await svg.trigger('pointerup', { pointerId: 2 })
    await wrapper.vm.$nextTick()

    elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rNew = elements.find((e) => e.id === 'R') as any
    arrowNew = elements.find((e) => e.id === 'A') as any

    // Shape is now at x=100, binding still intact, endpoint re-anchored AGAIN.
    expect(rNew.x).toBeCloseTo(100, 5)
    expect(arrowNew.endBinding).toEqual({ elementId: 'R' })
    expected = facingSideAnchor({ ...rectR, x: 100, y: 0 }, [otherEnd.x, otherEnd.y])
    expect(arrowNew.points[1][0]).toBeCloseTo(expected[0], 5)
    expect(arrowNew.points[1][1]).toBeCloseTo(expected[1], 5)
  })

})
