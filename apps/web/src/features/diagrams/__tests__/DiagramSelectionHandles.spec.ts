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
