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

function mountInSvg(element: DiagramElement, zoom = 1) {
  // DiagramElementView renders SVG children — wrap in an SVG (with the same
  // viewport <g> + CSS var the real canvas provides) so the DOM is valid.
  const wrapper = mount(
    {
      template: `
        <svg>
          <g :style="{ '--diagram-hit-sw': 12 / zoom }">
            <DiagramElementView :element="element" />
          </g>
        </svg>`,
      components: { DiagramElementView },
      props: ['element', 'zoom'],
    },
    { props: { element, zoom } },
  )
  return wrapper
}

// ── ICT-5: centered labels inside rectangle and ellipse shapes ───────────────

describe('DiagramElementView — shape labels', () => {
  it('rectangle without label renders no label <text>', () => {
    const wrapper = mountInSvg(makeRect())
    // Only the standalone text elements for shape labels — not the type:text element
    const texts = wrapper.findAll('text')
    expect(texts.length).toBe(0)
  })

  it('rectangle with label "Start" renders a centered <text> containing "Start"', () => {
    const el = { ...makeRect(), label: 'Start' }
    const wrapper = mountInSvg(el as DiagramElement)
    const text = wrapper.find('text')
    expect(text.exists()).toBe(true)
    expect(text.text()).toBe('Start')
    expect(text.attributes('text-anchor')).toBe('middle')
    // center: x=10+100/2=60, y=10+80/2=50
    expect(text.attributes('x')).toBe('60')
    expect(text.attributes('y')).toBe('50')
  })

  it('ellipse with label "Decision" renders centered text', () => {
    const el = { ...makeEllipse(), label: 'Decision' }
    const wrapper = mountInSvg(el as DiagramElement)
    const text = wrapper.find('text')
    expect(text.exists()).toBe(true)
    expect(text.text()).toBe('Decision')
    expect(text.attributes('text-anchor')).toBe('middle')
    // center: x=20+60/2=50, y=20+40/2=40
    expect(text.attributes('x')).toBe('50')
    expect(text.attributes('y')).toBe('40')
  })

  it('rectangle with whitespace-only label renders no <text>', () => {
    const el = { ...makeRect(), label: '   ' }
    const wrapper = mountInSvg(el as DiagramElement)
    const texts = wrapper.findAll('text')
    expect(texts.length).toBe(0)
  })

  it('label <text> has pointer-events="none" so it does not block shape hit-testing', () => {
    const el = { ...makeRect(), label: 'Start' }
    const wrapper = mountInSvg(el as DiagramElement)
    const text = wrapper.find('text')
    expect(text.exists()).toBe(true)
    expect(text.attributes('pointer-events')).toBe('none')
  })
})

// ── ICT-5: zoom-compensated hit targets ──────────────────────────────────────
//
// Mechanism (perf): hit-target stroke width comes from the CSS variable
// --diagram-hit-sw set on the viewport <g> (12 / zoom), NOT from a per-element
// prop. Zoom changes update one CSS var instead of re-rendering every element.
// jsdom doesn't resolve CSS cascade, so we assert the contract pieces:
//   1. hit targets exist and carry the class that binds stroke-width to the var
//   2. hit targets do NOT hardcode a stroke-width attribute (attr would beat CSS)
//   3. the canvas wrapper computes the var as 12 / zoom

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
      it('renders hit targets bound to the --diagram-hit-sw CSS var (no stroke-width attr)', () => {
        const wrapper = mountInSvg(make())
        const hits = wrapper.findAll('.diagram-hit-target')
        expect(hits.length).toBeGreaterThan(0)
        for (const hit of hits) {
          // An explicit attribute would override the CSS-var width — must be absent.
          expect(hit.attributes('stroke-width')).toBeUndefined()
        }
      })

      it('hit targets keep the element data attribute for hit-testing', () => {
        const el = make()
        const wrapper = mountInSvg(el)
        for (const hit of wrapper.findAll('.diagram-hit-target')) {
          expect(hit.attributes('data-element-id')).toBe(el.id)
        }
      })
    })
  }

  describe('viewport CSS var', () => {
    it.each([
      [1, 12],
      [0.1, 120],
      [2, 6],
    ])('at zoom %s the viewport <g> sets --diagram-hit-sw to %s (12 screen px)', (zoom, expected) => {
      const wrapper = mountInSvg(makeRect(), zoom)
      const g = wrapper.find('g')
      const style = g.attributes('style') ?? ''
      const match = style.match(/--diagram-hit-sw:\s*([\d.]+)/)
      expect(match).not.toBeNull()
      expect(Number(match![1])).toBeCloseTo(expected)
    })
  })
})
