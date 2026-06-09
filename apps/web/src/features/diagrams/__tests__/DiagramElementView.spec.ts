import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiagramElementView from '../DiagramElementView.vue'
import type { DiagramElement } from '@tasknote/shared'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRect(): DiagramElement {
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

function makeEllipse(): DiagramElement {
  return {
    id: 'ell-1',
    type: 'ellipse',
    x: 20,
    y: 20,
    width: 60,
    height: 40,
    stroke: '#000000',
    fill: null,
    strokeWidth: 2,
  }
}

function makeLine(): DiagramElement {
  return {
    id: 'line-1',
    type: 'line',
    points: [[0, 0], [100, 100]] as [[number, number], [number, number]],
    stroke: '#000000',
    strokeWidth: 2,
  }
}

function makeArrow(): DiagramElement {
  return {
    id: 'arrow-1',
    type: 'arrow',
    points: [[10, 10], [200, 200]] as [[number, number], [number, number]],
    stroke: '#000000',
    strokeWidth: 2,
  }
}

function makePen(): DiagramElement {
  return {
    id: 'pen-1',
    type: 'pen',
    points: [[0, 0], [10, 10], [20, 5]] as [number, number][],
    stroke: '#000000',
    strokeWidth: 2,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountInSvg(element: DiagramElement, zoom?: number) {
  // DiagramElementView renders SVG children — wrap in an SVG so the DOM is valid
  const wrapper = mount(
    {
      template: `<svg><DiagramElementView :element="element" v-bind="zoom !== undefined ? { zoom } : {}" /></svg>`,
      components: { DiagramElementView },
      props: ['element', 'zoom'],
    },
    { props: { element, zoom } },
  )
  return wrapper
}

function hitTargetStrokeWidths(wrapper: ReturnType<typeof mountInSvg>): string[] {
  return wrapper
    .findAll('.diagram-hit-target')
    .map((el) => el.attributes('stroke-width') ?? '')
}

// ── ICT-5: zoom-compensated hit targets ──────────────────────────────────────

describe('DiagramElementView — zoom-compensated hit targets', () => {
  const elementFactories = [
    { name: 'rectangle', make: makeRect },
    { name: 'ellipse', make: makeEllipse },
    { name: 'line', make: makeLine },
    { name: 'arrow', make: makeArrow },
    { name: 'pen', make: makePen },
  ]

  for (const { name, make } of elementFactories) {
    describe(name, () => {
      it('at default zoom 1: hit-target stroke-width is 12', () => {
        const wrapper = mountInSvg(make())
        const widths = hitTargetStrokeWidths(wrapper)
        expect(widths.length).toBeGreaterThan(0)
        for (const w of widths) {
          expect(Number(w)).toBeCloseTo(12)
        }
      })

      it('at zoom 0.1: hit-target stroke-width is 120 (12 screen px)', () => {
        const wrapper = mountInSvg(make(), 0.1)
        const widths = hitTargetStrokeWidths(wrapper)
        expect(widths.length).toBeGreaterThan(0)
        for (const w of widths) {
          expect(Number(w)).toBeCloseTo(120)
        }
      })

      it('at zoom 2: hit-target stroke-width is 6 (12 screen px)', () => {
        const wrapper = mountInSvg(make(), 2)
        const widths = hitTargetStrokeWidths(wrapper)
        expect(widths.length).toBeGreaterThan(0)
        for (const w of widths) {
          expect(Number(w)).toBeCloseTo(6)
        }
      })
    })
  }
})
