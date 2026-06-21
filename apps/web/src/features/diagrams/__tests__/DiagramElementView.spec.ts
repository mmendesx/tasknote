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

// ── ICT-3 + ICT-4: orthogonal polyline connectors ────────────────────────────

/** Parse "x1,y1 x2,y2 ..." SVG points attr into [[x1,y1],[x2,y2],...] */
function parsePoints(attr: string): [number, number][] {
  return attr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return [x, y]
    })
}

/** Assert every consecutive pair of points shares x or y (axis-aligned). */
function expectAxisAligned(pts: [number, number][]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    expect(x1 === x2 || y1 === y2).toBe(true)
  }
}

describe('DiagramElementView — orthogonal polyline connectors (ICT-3 + ICT-4)', () => {
  describe('arrow with stored waypoints renders through them', () => {
    // Render is dumb: it draws [start, ...waypoints, end]. No routing at render time.
    const arrowEl: DiagramElement = {
      id: 'arrow-offset',
      type: 'arrow',
      points: [[0, 0], [200, 40]] as [[number, number], [number, number]],
      stroke: '#ff0000',
      strokeWidth: 2,
      startBinding: { elementId: 'A' },
      waypoints: [[100, 0], [100, 40]] as [number, number][],
    }

    it('renders a <polyline> not a <line>', () => {
      const wrapper = mountInSvg(arrowEl)
      expect(wrapper.find('line').exists()).toBe(false)
      const polylines = wrapper.findAll('polyline')
      expect(polylines.length).toBeGreaterThan(0)
    })

    it('visible polyline points are axis-aligned and include start and end', () => {
      const wrapper = mountInSvg(arrowEl)
      // The first polyline in the template is the visible one
      const visible = wrapper.findAll('polyline').find(
        (p) => p.attributes('stroke') !== 'transparent',
      )
      expect(visible).toBeDefined()
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts.length).toBeGreaterThanOrEqual(2)
      expectAxisAligned(pts)
      expect(pts[0]).toEqual([0, 0])
      expect(pts[pts.length - 1]).toEqual([200, 40])
    })

    it('visible arrow polyline has marker-end and fill="none"', () => {
      const wrapper = mountInSvg(arrowEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => p.attributes('stroke') !== 'transparent',
      )
      expect(visible).toBeDefined()
      expect(visible!.attributes('marker-end')).toBe('url(#diagram-arrowhead)')
      expect(visible!.attributes('fill')).toBe('none')
    })
  })

  describe('route is stored, not derived at render', () => {
    it('arrow with waypoints renders polyline through all stored points in order', () => {
      const arrowEl: DiagramElement = {
        id: 'arrow-waypoints',
        type: 'arrow',
        points: [[234, 80], [296, 305]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
        waypoints: [[265, 80], [265, 305]] as [number, number][],
      }
      const wrapper = mountInSvg(arrowEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => p.attributes('stroke') !== 'transparent',
      )
      expect(visible).toBeDefined()
      expect(visible!.attributes('points')).toBe('234,80 265,80 265,305 296,305')
    })

    it('fully unbound line with no waypoints renders as a direct 2-point segment', () => {
      const lineEl: DiagramElement = {
        id: 'line-unbound-nodirect',
        type: 'line',
        points: [[50, 50], [150, 200]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(lineEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => !p.classes().includes('diagram-hit-target'),
      )
      expect(visible).toBeDefined()
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts).toEqual([[50, 50], [150, 200]])
    })
  })

  describe('line/arrow with axis-aligned stored endpoints (0 bends)', () => {
    it('line [[0,0],[200,0]] renders polyline with exactly the 2 endpoints', () => {
      const lineEl: DiagramElement = {
        id: 'line-straight',
        type: 'line',
        points: [[0, 0], [200, 0]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(lineEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => !p.classes().includes('diagram-hit-target'),
      )
      expect(visible).toBeDefined()
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts).toEqual([[0, 0], [200, 0]])
    })

    it('arrow [[0,0],[0,100]] (vertical) renders polyline with exactly the 2 endpoints', () => {
      const arrowEl: DiagramElement = {
        id: 'arrow-vertical',
        type: 'arrow',
        points: [[0, 0], [0, 100]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(arrowEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => !p.classes().includes('diagram-hit-target'),
      )
      expect(visible).toBeDefined()
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts).toEqual([[0, 0], [0, 100]])
    })
  })

  describe('fully unbound connector stays direct (no forced elbow)', () => {
    it('unbound diagonal line keeps its 2 stored points (not an elbow)', () => {
      const lineEl: DiagramElement = {
        id: 'line-free',
        type: 'line',
        points: [[0, 0], [100, 40]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(lineEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => !p.classes().includes('diagram-hit-target'),
      )
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts).toEqual([[0, 0], [100, 40]])
    })

    it('unbound diagonal arrow keeps its 2 stored points (not an elbow)', () => {
      const arrowEl: DiagramElement = {
        id: 'arrow-free',
        type: 'arrow',
        points: [[0, 0], [100, 40]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(arrowEl)
      const visible = wrapper.findAll('polyline').find(
        (p) => !p.classes().includes('diagram-hit-target'),
      )
      const pts = parsePoints(visible!.attributes('points') ?? '')
      expect(pts).toEqual([[0, 0], [100, 40]])
    })
  })

  describe('hit-target polyline', () => {
    it('line renders a hit-target <polyline> with stroke="transparent", fill="none", and data-element-id', () => {
      const lineEl: DiagramElement = {
        id: 'line-hit',
        type: 'line',
        points: [[0, 0], [200, 40]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(lineEl)
      const hitTarget = wrapper.find('.diagram-hit-target')
      expect(hitTarget.exists()).toBe(true)
      expect(hitTarget.element.tagName.toLowerCase()).toBe('polyline')
      expect(hitTarget.attributes('stroke')).toBe('transparent')
      expect(hitTarget.attributes('fill')).toBe('none')
      expect(hitTarget.attributes('data-element-id')).toBe('line-hit')
    })

    it('arrow hit-target covers the same route as the visible polyline', () => {
      const arrowEl: DiagramElement = {
        id: 'arrow-hit',
        type: 'arrow',
        points: [[0, 0], [200, 40]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(arrowEl)
      const polylines = wrapper.findAll('polyline')
      const visible = polylines.find((p) => p.attributes('stroke') !== 'transparent')
      const hit = wrapper.find('.diagram-hit-target')
      expect(visible!.attributes('points')).toBe(hit.attributes('points'))
    })

    it('arrow hit-target has no marker-end', () => {
      const arrowEl: DiagramElement = {
        id: 'arrow-hit-nomarker',
        type: 'arrow',
        points: [[0, 0], [200, 40]] as [[number, number], [number, number]],
        stroke: '#000000',
        strokeWidth: 2,
      }
      const wrapper = mountInSvg(arrowEl)
      const hit = wrapper.find('.diagram-hit-target')
      expect(hit.attributes('marker-end')).toBeUndefined()
    })
  })

  describe('pen regression', () => {
    it('pen element still renders its own polyline with raw points unchanged', () => {
      const wrapper = mountInSvg(makePen())
      const polylines = wrapper.findAll('polyline')
      // pen renders 2 polylines: visible + hit-target
      expect(polylines.length).toBe(2)
      const visible = polylines.find((p) => !p.classes().includes('diagram-hit-target'))
      expect(visible).toBeDefined()
      expect(visible!.attributes('points')).toBe('0,0 10,10 20,5')
    })
  })
})

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
