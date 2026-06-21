import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiagramSelectionHandles from '../DiagramSelectionHandles.vue'
import type { DiagramElement } from '@tasknote/shared'
import type { SelectionBBox } from '../useSelection'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRectElement(): DiagramElement {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 10,
    y: 10,
    width: 100,
    height: 80,
    stroke: '#000000',
    fill: null,
    strokeWidth: 2,
  }
}

function makeArrowElement(): DiagramElement {
  return {
    id: 'arrow-1',
    type: 'arrow',
    points: [
      [0, 0],
      [100, 100],
    ] as [[number, number], [number, number]],
    stroke: '#000000',
    strokeWidth: 2,
  }
}

function makeBbox(element: DiagramElement): SelectionBBox {
  if ('x' in element && 'width' in element && 'height' in element) {
    return {
      x: (element as any).x,
      y: (element as any).y,
      width: (element as any).width,
      height: (element as any).height,
    }
  }
  return { x: 0, y: 0, width: 100, height: 100 }
}

// ── Mount helpers ─────────────────────────────────────────────────────────────

function mountShapeHandles(zoom: number) {
  const element = makeRectElement()
  const bbox = makeBbox(element)
  const wrapper = mount(
    {
      template: `<svg><DiagramSelectionHandles
        :bbox="bbox"
        :zoom="zoom"
        :showEndpointHandles="false"
        :element="element"
      /></svg>`,
      components: { DiagramSelectionHandles },
      props: ['bbox', 'zoom', 'element'],
    },
    { props: { bbox, zoom, element } },
  )
  return wrapper
}

function mountEndpointHandles(zoom: number) {
  const element = makeArrowElement()
  const bbox = makeBbox(element)
  const wrapper = mount(
    {
      template: `<svg><DiagramSelectionHandles
        :bbox="bbox"
        :zoom="zoom"
        :showEndpointHandles="true"
        :element="element"
      /></svg>`,
      components: { DiagramSelectionHandles },
      props: ['bbox', 'zoom', 'element'],
    },
    { props: { bbox, zoom, element } },
  )
  return wrapper
}

// ── ICT-10: 12 screen-px handle hit areas ─────────────────────────────────────

describe('DiagramSelectionHandles — 12 screen-px hit areas', () => {
  // ── Shape handles ────────────────────────────────────────────────────────────

  describe('shape handles', () => {
    it('handle hit area is at least 12 screen px at zoom 1', () => {
      const wrapper = mountShapeHandles(1)
      const hitRects = wrapper.findAll('.diagram-handle-hit')
      expect(hitRects.length).toBeGreaterThan(0)
      for (const el of hitRects) {
        const w = Number(el.attributes('width') ?? 0)
        const h = Number(el.attributes('height') ?? 0)
        // At zoom 1: scene units == screen px
        expect(w).toBeGreaterThanOrEqual(12)
        expect(h).toBeGreaterThanOrEqual(12)
      }
    })

    it('handle hit area compensates zoom — zoom 0.5 gives ≥24 scene units', () => {
      const wrapper = mountShapeHandles(0.5)
      const hitRects = wrapper.findAll('.diagram-handle-hit')
      expect(hitRects.length).toBeGreaterThan(0)
      for (const el of hitRects) {
        const w = Number(el.attributes('width') ?? 0)
        const h = Number(el.attributes('height') ?? 0)
        // 12 screen px / 0.5 zoom = 24 scene units
        expect(w).toBeGreaterThanOrEqual(24)
        expect(h).toBeGreaterThanOrEqual(24)
      }
    })

    it('handle hit area compensates zoom — zoom 2 gives ≥6 scene units', () => {
      const wrapper = mountShapeHandles(2)
      const hitRects = wrapper.findAll('.diagram-handle-hit')
      expect(hitRects.length).toBeGreaterThan(0)
      for (const el of hitRects) {
        const w = Number(el.attributes('width') ?? 0)
        const h = Number(el.attributes('height') ?? 0)
        // 12 screen px / 2 zoom = 6 scene units
        expect(w).toBeGreaterThanOrEqual(6)
        expect(h).toBeGreaterThanOrEqual(6)
      }
    })

    it('pointerdown on the hit group emits resizeStart with correct handle id', async () => {
      const element = makeRectElement()
      const bbox = makeBbox(element)

      // Mount the component directly so we can listen to emitted events
      const wrapper = mount(DiagramSelectionHandles, {
        attachTo: document.createElement('svg'),
        props: {
          bbox,
          zoom: 1,
          showEndpointHandles: false,
          element,
        },
      })

      // Find all g-wrappers that carry data-resize-handle
      const handleGroups = wrapper.findAll('g[data-resize-handle]')
      expect(handleGroups.length).toBeGreaterThan(0)

      const firstGroup = handleGroups[0]
      const handleId = firstGroup.attributes('data-resize-handle')

      await firstGroup.trigger('pointerdown', { clientX: 50, clientY: 60 })

      const emitted = wrapper.emitted('resizeStart')
      expect(emitted).toBeTruthy()
      expect(emitted![0][0]).toBe(handleId)
    })

    it('visible handle stays 8 screen px at zoom 1', () => {
      const wrapper = mountShapeHandles(1)
      const visibleRects = wrapper.findAll('.diagram-handle-visible')
      expect(visibleRects.length).toBeGreaterThan(0)
      for (const el of visibleRects) {
        const w = Number(el.attributes('width') ?? 0)
        const h = Number(el.attributes('height') ?? 0)
        expect(w).toBeCloseTo(8)
        expect(h).toBeCloseTo(8)
      }
    })
  })

  // ── Endpoint handles (line/arrow) ────────────────────────────────────────────

  describe('endpoint handles', () => {
    it('handle hit area is at least 12 screen px at zoom 1', () => {
      const wrapper = mountEndpointHandles(1)
      const hitCircles = wrapper.findAll('.diagram-handle-hit')
      expect(hitCircles.length).toBeGreaterThan(0)
      for (const el of hitCircles) {
        const r = Number(el.attributes('r') ?? 0)
        // diameter = 2r ≥ 12 → r ≥ 6
        expect(r * 2).toBeGreaterThanOrEqual(12)
      }
    })

    it('handle hit area compensates zoom — zoom 0.5 gives ≥24 scene-unit diameter', () => {
      const wrapper = mountEndpointHandles(0.5)
      const hitCircles = wrapper.findAll('.diagram-handle-hit')
      expect(hitCircles.length).toBeGreaterThan(0)
      for (const el of hitCircles) {
        const r = Number(el.attributes('r') ?? 0)
        expect(r * 2).toBeGreaterThanOrEqual(24)
      }
    })

    it('handle hit area compensates zoom — zoom 2 gives ≥6 scene-unit diameter', () => {
      const wrapper = mountEndpointHandles(2)
      const hitCircles = wrapper.findAll('.diagram-handle-hit')
      expect(hitCircles.length).toBeGreaterThan(0)
      for (const el of hitCircles) {
        const r = Number(el.attributes('r') ?? 0)
        expect(r * 2).toBeGreaterThanOrEqual(6)
      }
    })

    it('pointerdown on an endpoint hit group emits resizeStart with correct index', async () => {
      const element = makeArrowElement()
      const bbox = makeBbox(element)

      const wrapper = mount(DiagramSelectionHandles, {
        attachTo: document.createElement('svg'),
        props: {
          bbox,
          zoom: 1,
          showEndpointHandles: true,
          element,
        },
      })

      const handleGroups = wrapper.findAll('g[data-resize-handle]')
      expect(handleGroups.length).toBe(2)

      await handleGroups[0].trigger('pointerdown', { clientX: 0, clientY: 0 })

      const emitted = wrapper.emitted('resizeStart')
      expect(emitted).toBeTruthy()
      // index 0 is returned as a number by onHandlePointerDown
      expect(Number(emitted![0][0])).toBe(0)
    })

    it('visible endpoint circle stays 8 screen px diameter at zoom 1', () => {
      const wrapper = mountEndpointHandles(1)
      const visibleCircles = wrapper.findAll('.diagram-handle-visible')
      expect(visibleCircles.length).toBeGreaterThan(0)
      for (const el of visibleCircles) {
        const r = Number(el.attributes('r') ?? 0)
        // HANDLE_SCREEN_PX = 8, r = HANDLE_HALF_SCREEN / zoom = 4 / 1 = 4
        expect(r * 2).toBeCloseTo(8)
      }
    })
  })
})

// ── ICT-6: Selection chrome refinement ───────────────────────────────────────

describe('DiagramSelectionHandles — ICT-6 chrome refinement', () => {
  describe('square handles (shape elements)', () => {
    it('visible shape handles use surface fill token (not hardcoded white)', () => {
      const wrapper = mountShapeHandles(1)
      const visibleRects = wrapper.findAll('.diagram-handle-visible')
      expect(visibleRects.length).toBeGreaterThan(0)
      for (const el of visibleRects) {
        // Must use CSS token, not plain 'white'
        const fill = el.attributes('fill') ?? ''
        expect(fill).toContain('--color-surface')
      }
    })

    it('visible shape handles have accent stroke', () => {
      const wrapper = mountShapeHandles(1)
      const visibleRects = wrapper.findAll('.diagram-handle-visible')
      expect(visibleRects.length).toBeGreaterThan(0)
      for (const el of visibleRects) {
        const stroke = el.attributes('stroke') ?? ''
        expect(stroke).toContain('--color-accent')
      }
    })

    it('visible shape handles have drop-shadow filter applied', () => {
      const wrapper = mountShapeHandles(1)
      const visibleRects = wrapper.findAll('.diagram-handle-visible')
      expect(visibleRects.length).toBeGreaterThan(0)
      for (const el of visibleRects) {
        const filter = el.attributes('filter') ?? ''
        expect(filter).toContain('diagram-handle-shadow')
      }
    })

    it('drop-shadow filter definition is rendered in defs', () => {
      const wrapper = mountShapeHandles(1)
      const filterEl = wrapper.find('filter#diagram-handle-shadow')
      expect(filterEl.exists()).toBe(true)
    })
  })

  describe('endpoint handles (line/arrow elements)', () => {
    it('visible endpoint handles use surface fill token', () => {
      const wrapper = mountEndpointHandles(1)
      const visibleCircles = wrapper.findAll('.diagram-handle-visible')
      expect(visibleCircles.length).toBeGreaterThan(0)
      for (const el of visibleCircles) {
        const fill = el.attributes('fill') ?? ''
        expect(fill).toContain('--color-surface')
      }
    })

    it('visible endpoint handles have drop-shadow filter applied', () => {
      const wrapper = mountEndpointHandles(1)
      const visibleCircles = wrapper.findAll('.diagram-handle-visible')
      expect(visibleCircles.length).toBeGreaterThan(0)
      for (const el of visibleCircles) {
        const filter = el.attributes('filter') ?? ''
        expect(filter).toContain('diagram-handle-shadow')
      }
    })
  })
})

// ── ICT-6 regression: elbow-routed arrow shows only 2 stored endpoint handles ──

describe('DiagramSelectionHandles — elbow-routed arrow endpoint handles', () => {
  it('renders exactly 2 handle groups for an arrow whose points would produce elbow bends', () => {
    // points [[0,0],[200,40]] would derive a 2-bend elbow at render time,
    // but selection handles must only sit at the 2 stored endpoints.
    const element = {
      id: 'arrow-elbow',
      type: 'arrow',
      points: [
        [0, 0],
        [200, 40],
      ] as [[number, number], [number, number]],
      stroke: '#000000',
      strokeWidth: 2,
    } as DiagramElement

    const bbox: SelectionBBox = { x: 0, y: 0, width: 200, height: 40 }

    const wrapper = mount(DiagramSelectionHandles, {
      attachTo: document.createElement('svg'),
      props: {
        bbox,
        zoom: 1,
        showEndpointHandles: true,
        element,
      },
    })

    const handleGroups = wrapper.findAll('g[data-resize-handle]')
    // Must be exactly 2 — one per stored endpoint, never at derived bends
    expect(handleGroups).toHaveLength(2)
  })

  it('positions handles at the stored endpoints [0,0] and [200,40], not at derived bends', () => {
    const element = {
      id: 'arrow-elbow',
      type: 'arrow',
      points: [
        [0, 0],
        [200, 40],
      ] as [[number, number], [number, number]],
      stroke: '#000000',
      strokeWidth: 2,
    } as DiagramElement

    const bbox: SelectionBBox = { x: 0, y: 0, width: 200, height: 40 }

    const wrapper = mount(DiagramSelectionHandles, {
      attachTo: document.createElement('svg'),
      props: {
        bbox,
        zoom: 1,
        showEndpointHandles: true,
        element,
      },
    })

    // Visible circles carry the cx/cy derived from element.points[idx]
    const visibleCircles = wrapper.findAll('.diagram-handle-visible')
    expect(visibleCircles).toHaveLength(2)

    const first = visibleCircles[0]
    expect(Number(first.attributes('cx'))).toBe(0)
    expect(Number(first.attributes('cy'))).toBe(0)

    const second = visibleCircles[1]
    expect(Number(second.attributes('cx'))).toBe(200)
    expect(Number(second.attributes('cy'))).toBe(40)
  })
})

// ── ICT-6: Waypoint / segment handles ────────────────────────────────────────

function makeArrowWithWaypoints(): DiagramElement {
  return {
    id: 'arrow-wp',
    type: 'arrow',
    points: [
      [0, 0],
      [200, 0],
    ] as [[number, number], [number, number]],
    stroke: '#000000',
    strokeWidth: 2,
    waypoints: [[50, 50], [150, 50]],
  } as unknown as DiagramElement
}

function mountEndpointHandlesWithWaypoints(element: DiagramElement) {
  const bbox: SelectionBBox = { x: 0, y: 0, width: 200, height: 50 }
  return mount(DiagramSelectionHandles, {
    attachTo: document.createElement('svg'),
    props: {
      bbox,
      zoom: 1,
      showEndpointHandles: true,
      element,
    },
  })
}

describe('DiagramSelectionHandles — ICT-6 waypoint handles', () => {
  it('renders exactly 2 endpoint handles (data-resize-handle) even with 2 waypoints', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    const endpointGroups = wrapper.findAll('g[data-resize-handle]')
    expect(endpointGroups).toHaveLength(2)
  })

  it('renders waypoint handles distinct from endpoint handles', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    const wpHandles = wrapper.findAll('g[data-waypoint-handle]')
    // 2 waypoints → 2 existing-waypoint handles + 3 segment-midpoint handles = 5 total
    expect(wpHandles.length).toBeGreaterThan(0)
  })

  it('renders 2 waypoint handles for 2 stored waypoints', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    // data-waypoint-handle="wp-0" and "wp-1"
    const wpHandles = wrapper.findAll('g[data-waypoint-handle^="wp-"]')
    expect(wpHandles).toHaveLength(2)
  })

  it('renders 3 segment-midpoint handles for a route with 2 waypoints (3 segments)', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    // data-waypoint-handle="seg-0", "seg-1", "seg-2"
    const segHandles = wrapper.findAll('g[data-waypoint-handle^="seg-"]')
    expect(segHandles).toHaveLength(3)
  })

  it('renders 1 segment handle for a connector with no waypoints', () => {
    const element = makeArrowElement() // no waypoints → route has 1 segment
    const wrapper = mountEndpointHandlesWithWaypoints(element)
    const segHandles = wrapper.findAll('g[data-waypoint-handle^="seg-"]')
    expect(segHandles).toHaveLength(1)
  })

  it('waypoint handles use diagram-waypoint-handle-visible class (not diagram-handle-visible)', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    const wpVisible = wrapper.findAll('.diagram-waypoint-handle-visible')
    expect(wpVisible.length).toBeGreaterThan(0)
  })

  it('endpoint handles still use diagram-handle-visible class', () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    // Only the 2 endpoint circles should have .diagram-handle-visible
    const epVisible = wrapper.findAll('.diagram-handle-visible')
    expect(epVisible).toHaveLength(2)
  })

  it('pointerdown on a segment handle emits waypointDragStart with kind=segment', async () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    const segHandle = wrapper.find('g[data-waypoint-handle="seg-0"]')
    expect(segHandle.exists()).toBe(true)

    await segHandle.trigger('pointerdown', { clientX: 25, clientY: 25 })

    const emitted = wrapper.emitted('waypointDragStart')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe('segment')
    expect(emitted![0][1]).toBe(0) // segmentIndex
  })

  it('pointerdown on a waypoint handle emits waypointDragStart with kind=waypoint', async () => {
    const wrapper = mountEndpointHandlesWithWaypoints(makeArrowWithWaypoints())
    const wpHandle = wrapper.find('g[data-waypoint-handle="wp-1"]')
    expect(wpHandle.exists()).toBe(true)

    await wpHandle.trigger('pointerdown', { clientX: 150, clientY: 50 })

    const emitted = wrapper.emitted('waypointDragStart')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe('waypoint')
    expect(emitted![0][1]).toBe(1) // waypointIndex
  })
})
