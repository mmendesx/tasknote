import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useResize } from '../useResize'
import DiagramCanvas from '../DiagramCanvas.vue'
import type { DiagramElement, DiagramViewport } from '@tasknote/shared'

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRect(overrides: Partial<Extract<DiagramElement, { type: 'rectangle' }>> = {}): DiagramElement {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 50,
    y: 50,
    width: 100,
    height: 80,
    stroke: '#000',
    strokeWidth: 2,
    ...overrides,
  }
}

function makeArrow(overrides: Partial<Extract<DiagramElement, { type: 'arrow' }>> = {}): DiagramElement {
  return {
    id: 'arrow-1',
    type: 'arrow',
    points: [[10, 10], [110, 90]],
    stroke: '#000',
    strokeWidth: 2,
    ...overrides,
  }
}

const defaultViewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }

function makeResize(elements: DiagramElement[], viewport: DiagramViewport = defaultViewport) {
  return useResize(() => elements, () => viewport)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramResize', () => {
  describe('corner handle se resizes rectangle', () => {
    it('dragging se by (20,15) increases width and height', () => {
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(20, 15)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(100 + 20)
      expect((patch as any).height).toBe(80 + 15)
      // x/y should not change when dragging se
      expect((patch as any).x).toBe(50)
      expect((patch as any).y).toBe(50)
    })
  })

  describe('n handle resizes only height', () => {
    it('dragging n by (0,-30) increases height by moving top edge up', () => {
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'n', 0, 0)
      // Drag up (negative y = moving north = dy is negative)
      const patch = updateResize(0, -30)

      expect(patch).not.toBeNull()
      // Width should remain unchanged
      expect((patch as any).width).toBe(100)
      // Height increases when top moves up (dy negative → newH = oldH - dy = 80 - (-30) = 110)
      expect((patch as any).height).toBe(110)
      // y should decrease (top moves up)
      expect((patch as any).y).toBe(50 + (-30))
      // x should be unchanged
      expect((patch as any).x).toBe(50)
    })
  })

  describe('resize clamps to minimum 8x8', () => {
    it('dragging se to shrink below 8px clamps to 8', () => {
      const rect = makeRect({ width: 10, height: 10 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Try to shrink by 50px — would produce negative size without clamping
      const patch = updateResize(-50, -50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      expect((patch as any).height).toBe(8)
    })

    it('dragging nw to shrink below 8px clamps width to 8', () => {
      const rect = makeRect({ width: 10, height: 10 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'nw', 0, 0)
      // Drag right/down by 50px — moves nw toward se, shrinking the shape
      const patch = updateResize(50, 50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      expect((patch as any).height).toBe(8)
    })
  })

  describe('clamps at the fixed corner, no flip (spec-14 FR-B6)', () => {
    it('dragging nw far right clamps width to 8 pinned at the fixed (se) corner', () => {
      // rect at (50,50) 100×80 — drag nw 120px right: without clamp newW would be negative.
      // Clamp: left is pinned at origRight - MIN_SIZE = 150-8 = 142, so x=142, w=8.
      const rect = makeRect()
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'nw', 0, 0)
      const patch = updateResize(120, 0)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      // x must be pinned at origRight - MIN_SIZE = (50+100) - 8 = 142
      expect((patch as any).x).toBe(142)
    })

    it('dragging se 100px past nw on a 40×40 rect clamps to exactly 8×8 at the fixed (nw) corner', () => {
      // rect at (50,50) 40×40 — drag se 100px left and 100px up (well past nw corner).
      // right clamps to x + MIN_SIZE = 50+8 = 58 → w = 8, x stays 50.
      // bottom clamps to y + MIN_SIZE = 50+8 = 58 → h = 8, y stays 50.
      const rect = makeRect({ x: 50, y: 50, width: 40, height: 40 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(-100, -100)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      expect((patch as any).height).toBe(8)
      // Fixed (nw) corner must not move
      expect((patch as any).x).toBe(50)
      expect((patch as any).y).toBe(50)
    })

    it('dragging se left past nw edge clamps width to 8 — no flip occurs', () => {
      const rect = makeRect({ x: 50, y: 50, width: 100, height: 80 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Drag se 200px to the left — past the left edge
      const patch = updateResize(-200, 0)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(8)
      // x stays at the fixed left edge (nw corner)
      expect((patch as any).x).toBe(50)
    })
  })

  describe('endpoint handle on arrow re-positions its point', () => {
    it('dragging end handle (1) moves only the endpoint', () => {
      const arrow = makeArrow()
      const { beginResize, updateResize } = makeResize([arrow])

      beginResize('arrow-1', 1, 0, 0)
      const patch = updateResize(20, 10)

      expect(patch).not.toBeNull()
      const points = (patch as any).points as [[number, number], [number, number]]
      expect(points).toBeDefined()
      // Start point should remain unchanged
      expect(points[0][0]).toBe(10)
      expect(points[0][1]).toBe(10)
      // End point should be moved
      expect(points[1][0]).toBe(110 + 20)
      expect(points[1][1]).toBe(90 + 10)
    })

    it('dragging start handle (0) moves only the start point', () => {
      const arrow = makeArrow()
      const { beginResize, updateResize } = makeResize([arrow])

      beginResize('arrow-1', 0, 0, 0)
      const patch = updateResize(-5, -5)

      expect(patch).not.toBeNull()
      const points = (patch as any).points as [[number, number], [number, number]]
      // Start point moves
      expect(points[0][0]).toBe(10 - 5)
      expect(points[0][1]).toBe(10 - 5)
      // End stays
      expect(points[1][0]).toBe(110)
      expect(points[1][1]).toBe(90)
    })
  })

  describe('isResizing state', () => {
    it('is false before beginResize', () => {
      const rect = makeRect()
      const { isResizing } = makeResize([rect])
      expect(isResizing.value).toBe(false)
    })

    it('is true after beginResize and false after cancelResize', () => {
      const rect = makeRect()
      const { beginResize, cancelResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      expect(isResizing.value).toBe(true)

      cancelResize()
      expect(isResizing.value).toBe(false)
    })

    it('is false after commitResize', () => {
      const rect = makeRect()
      const { beginResize, commitResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      commitResize(10, 10)
      expect(isResizing.value).toBe(false)
    })
  })

  describe('zoom scaling', () => {
    it('respects viewport zoom when computing scene deltas', () => {
      const rect = makeRect()
      // At zoom=2, a 20px screen delta is 10 scene units
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 2 }
      const { beginResize, updateResize } = makeResize([rect], viewport)

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(20, 0)

      expect(patch).not.toBeNull()
      // 20 screen px / zoom 2 = 10 scene px added to width
      expect((patch as any).width).toBe(110)
    })
  })

  // ── Acceptance scenarios (PRD) ────────────────────────────────────────────────

  describe('acceptance: corner-resize 100x100 rect by +50,+50 produces 150x150', () => {
    it('dragging se handle +50,+50 on a 100x100 rect yields 150x150', () => {
      const rect = makeRect({ width: 100, height: 100 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      const patch = updateResize(50, 50)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBe(150)
      expect((patch as any).height).toBe(150)
      // Origin must not move for se drag
      expect((patch as any).x).toBe(50)
      expect((patch as any).y).toBe(50)
    })
  })

  describe('acceptance: min clamp — 20x20 rect dragged far past opposite corner', () => {
    it('width and height are never below 8 and never negative', () => {
      const rect = makeRect({ width: 20, height: 20 })
      const { beginResize, updateResize } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      // Drag far left/up, well past the nw corner
      const patch = updateResize(-500, -500)

      expect(patch).not.toBeNull()
      expect((patch as any).width).toBeGreaterThanOrEqual(8)
      expect((patch as any).height).toBeGreaterThanOrEqual(8)
      expect((patch as any).width).toBeGreaterThan(0)
      expect((patch as any).height).toBeGreaterThan(0)
    })
  })

  describe('acceptance: endpoint dropped on a rectangle binds to it', () => {
    it('end handle dragged to scene point inside target rect produces endBinding and edge-anchored point', () => {
      // arrow starts at (10,10)→(300,300); target rect covers (100,100)→(200,180)
      const targetRect: DiagramElement = {
        id: 'target',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 100,
        height: 80,
        stroke: '#000',
        strokeWidth: 2,
      }
      const arrow = makeArrow({ points: [[10, 10], [300, 300]] })
      const elements = [targetRect, arrow]
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }
      const { beginResize, commitResize } = makeResize(elements, viewport)

      // start at screen (300,300) == scene (300,300), drag to screen (150,140) == scene (150,140)
      // scene (150,140) is inside the rect (100..200, 100..180)
      beginResize('arrow-1', 1, 300, 300)
      const result = commitResize(150, 140)

      expect(result).not.toBeNull()
      expect(result!.newBindings).toBeDefined()
      expect(result!.newBindings!.endBinding).toEqual({ elementId: 'target' })

      // The committed endpoint must lie on or near the rect boundary (edge-anchored)
      const pts = (result!.patch as any).points as [[number, number], [number, number]]
      expect(pts).toBeDefined()
      const [ex, ey] = pts[1]
      // boundEndpoint places the point on the rect boundary; it must be outside or at the edge
      // The point should NOT be inside the rect interior (it's on the perimeter ± gap)
      const insideX = ex > 100 && ex < 200
      const insideY = ey > 100 && ey < 180
      // At least one axis must be at or beyond the boundary (i.e., not strictly inside both)
      expect(insideX && insideY).toBe(false)
    })
  })

  describe('acceptance: endpoint dropped on empty canvas stays unbound', () => {
    it('end handle dragged to empty scene point produces null endBinding at drop location', () => {
      const arrow = makeArrow({ points: [[10, 10], [300, 300]] })
      const elements = [arrow]
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }
      const { beginResize, commitResize } = makeResize(elements, viewport)

      // start at screen (300,300), drag end handle to scene (400,400) — no shape there
      beginResize('arrow-1', 1, 300, 300)
      const result = commitResize(400, 400)

      expect(result).not.toBeNull()
      expect(result!.newBindings).toBeDefined()
      expect(result!.newBindings!.endBinding).toBeNull()

      // Point should be at the drag location (no anchoring when unbound)
      const pts = (result!.patch as any).points as [[number, number], [number, number]]
      expect(pts[1][0]).toBe(300 + 100) // 300 original + 100 delta
      expect(pts[1][1]).toBe(300 + 100)
    })
  })

  describe('acceptance: topmost shape wins when endpoint dropped on overlapping shapes', () => {
    it('binding resolves to the shape later in elements array (rendered on top)', () => {
      const bottomRect: DiagramElement = {
        id: 'bottom',
        type: 'rectangle',
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        stroke: '#000',
        strokeWidth: 2,
      }
      const topRect: DiagramElement = {
        id: 'top',
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        stroke: '#000',
        strokeWidth: 2,
      }
      // arrow is after topRect in elements; but arrows aren't bindable so topRect is topmost bindable
      const arrow = makeArrow({ points: [[10, 10], [300, 300]] })
      const elements = [bottomRect, topRect, arrow]
      const viewport: DiagramViewport = { scrollX: 0, scrollY: 0, zoom: 1 }
      const { beginResize, commitResize } = makeResize(elements, viewport)

      // drag end handle from screen (300,300) to screen (130,130)
      // arrow end was at scene (300,300); delta = (130-300, 130-300) = (-170,-170) scene units
      // new endpoint scene coords = (300-170, 300-170) = (130,130) — inside both rects
      beginResize('arrow-1', 1, 300, 300)
      const result = commitResize(130, 130)

      expect(result).not.toBeNull()
      expect(result!.newBindings!.endBinding).toEqual({ elementId: 'top' })
    })
  })

  describe('acceptance: cancelResize discards the gesture — no patch produced', () => {
    it('after cancelResize, updateResize returns null', () => {
      const rect = makeRect()
      const { beginResize, updateResize, cancelResize, isResizing } = makeResize([rect])

      beginResize('rect-1', 'se', 0, 0)
      expect(isResizing.value).toBe(true)

      cancelResize()
      expect(isResizing.value).toBe(false)
      // After cancel, updateResize must return null (no active state)
      const patch = updateResize(100, 100)
      expect(patch).toBeNull()
    })
  })
})

// ── Pointer-capture integration tests ─────────────────────────────────────────
//
// These tests mount DiagramCanvas to verify the pointer-capture contract:
// when a resize handle drag starts, setPointerCapture must be called on the SVG
// so that move/up events continue to reach the canvas even if the pointer
// leaves the SVG mid-gesture.

vi.mock('@/api')

// ── Mount tracking ────────────────────────────────────────────────────────────

const _mountedWrappers: VueWrapper[] = []

async function mountCanvasWithRect() {
  const { diagrams: apiDiagrams } = await import('@/api')
  const rectEl: DiagramElement = {
    id: 'rect-capture',
    type: 'rectangle',
    x: 50,
    y: 50,
    width: 100,
    height: 80,
    stroke: '#000000',
    strokeWidth: 2,
    fill: null,
  }
  vi.mocked(apiDiagrams.getDiagram).mockResolvedValueOnce({
    id: 1,
    title: 'Test',
    scene_json: {
      version: 1,
      elements: [rectEl],
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

  return { wrapper, pinia, storeState }
}

describe('DiagramResize pointer-capture integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    while (_mountedWrappers.length) _mountedWrappers.pop()!.unmount()
  })

  it('starting a handle drag captures the pointer on the SVG with the event pointerId', async () => {
    const { wrapper, pinia } = await mountCanvasWithRect()

    const svg = wrapper.find('svg.diagram-canvas')
    expect(svg.exists()).toBe(true)

    // Spy on setPointerCapture before the gesture
    const capturespy = vi.fn()
    ;(svg.element as SVGSVGElement).setPointerCapture = capturespy

    // Select the rect so resize handles render
    const elementNode = wrapper.find('[data-element-id="rect-capture"]')
    expect(elementNode.exists()).toBe(true)
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 90, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).toContain('rect-capture')

    // Handles should now be rendered — find the se handle
    const handle = wrapper.find('[data-resize-handle="se"]')
    expect(handle.exists()).toBe(true)

    // Trigger pointerdown on the handle with a distinct pointerId
    const pointerId = 7
    await handle.trigger('pointerdown', { pointerId, clientX: 150, clientY: 130 })
    await wrapper.vm.$nextTick()

    // setPointerCapture must have been called on the SVG with this pointerId
    expect(capturespy).toHaveBeenCalledWith(pointerId)
  })

  it('release outside the canvas ends the resize and clears resizeState', async () => {
    const { wrapper, pinia } = await mountCanvasWithRect()

    const svg = wrapper.find('svg.diagram-canvas')
    // Stub capture so it does not throw in jsdom
    ;(svg.element as SVGSVGElement).setPointerCapture = vi.fn()

    // Select the rect
    const elementNode = wrapper.find('[data-element-id="rect-capture"]')
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 90, pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(pinia.state.value['diagrams'].selectedIds).toContain('rect-capture')

    // Start resize via handle
    const handle = wrapper.find('[data-resize-handle="se"]')
    expect(handle.exists()).toBe(true)

    await handle.trigger('pointerdown', { pointerId: 1, clientX: 150, clientY: 130 })
    await wrapper.vm.$nextTick()

    // Drag a bit
    await svg.trigger('pointermove', { clientX: 170, clientY: 145, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Simulate pointerup on the capture target (SVG) — as if pointer was released
    // outside the browser window but the captured element still receives it
    await svg.trigger('pointerup', { clientX: 200, clientY: 200, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // The element geometry should have been updated (resize committed on pointerup).
    // Handle drag started at (150,130), pointerup at (200,200): delta (+50,+70) scene units.
    // new width = 100+50=150, new height = 80+70=150.
    const elements = pinia.state.value['diagrams'].elements as DiagramElement[]
    const resized = elements.find((e) => e.id === 'rect-capture')
    expect(resized).toBeDefined()
    expect((resized as any).width).toBe(150)
    expect((resized as any).height).toBe(150)

    // resizeState must be null after pointerup — no stale state
    // We verify this indirectly: a subsequent pointerdown on empty canvas starts a
    // marquee (not inheriting the stale resize). The store's elements should not
    // change from another pointerdown → pointermove on empty canvas area.
    const widthBefore = (resized as any).width
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 2 })
    await svg.trigger('pointermove', { clientX: 30, clientY: 30, pointerId: 2 })
    await wrapper.vm.$nextTick()

    const elementsAfter = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rectAfter = elementsAfter.find((e) => e.id === 'rect-capture')
    // Width should be unchanged — the new gesture is a marquee, not a resize continuation
    expect((rectAfter as any).width).toBe(widthBefore)
  })

  it('next pointerdown starts fresh after a stale resizeState is left from an interrupted gesture', async () => {
    const { wrapper, pinia } = await mountCanvasWithRect()

    const svg = wrapper.find('svg.diagram-canvas')
    ;(svg.element as SVGSVGElement).setPointerCapture = vi.fn()

    // Select the rect
    const elementNode = wrapper.find('[data-element-id="rect-capture"]')
    await elementNode.trigger('pointerdown', { clientX: 100, clientY: 90, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Start resize — intentionally do NOT fire pointerup to simulate interrupted gesture
    const handle = wrapper.find('[data-resize-handle="se"]')
    expect(handle.exists()).toBe(true)

    await handle.trigger('pointerdown', { pointerId: 1, clientX: 150, clientY: 130 })
    await wrapper.vm.$nextTick()

    // Move a little but do NOT release — stale resize state would persist
    await svg.trigger('pointermove', { clientX: 160, clientY: 140, pointerId: 1 })
    await wrapper.vm.$nextTick()

    // Record element state before the next pointerdown
    const elementsBefore = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rectBefore = elementsBefore.find((e) => e.id === 'rect-capture')
    const widthBefore = (rectBefore as any).width

    // Next pointerdown on empty canvas (no pointerup between) — guard should reset stale state
    await svg.trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 2 })
    await wrapper.vm.$nextTick()

    // Move in the new gesture — should NOT affect rect geometry (marquee gesture, not resize)
    await svg.trigger('pointermove', { clientX: 50, clientY: 50, pointerId: 2 })
    await wrapper.vm.$nextTick()

    const elementsAfter = pinia.state.value['diagrams'].elements as DiagramElement[]
    const rectAfter = elementsAfter.find((e) => e.id === 'rect-capture')

    // Geometry must not change from the stale resize being re-driven by the new gesture
    expect((rectAfter as any).width).toBe(widthBefore)

    // Selection should have been cleared (clicked empty canvas)
    expect(pinia.state.value['diagrams'].selectedIds).toHaveLength(0)
  })
})
