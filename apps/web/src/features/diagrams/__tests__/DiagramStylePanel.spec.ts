import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramStylePanel from '../DiagramStylePanel.vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement } from '@tasknote/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the narrowed variant so spread-with-override fixtures typecheck.
function makeRectangle(id: string): Extract<DiagramElement, { type: 'rectangle' }> {
  return {
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    stroke: 'currentColor',
    fill: null,
    strokeWidth: 2,
  }
}

function makeText(id: string): DiagramElement {
  return {
    id,
    type: 'text',
    x: 10,
    y: 10,
    text: 'hello',
    fontSize: 16,
    color: 'currentColor',
  }
}

function makeLine(id: string): DiagramElement {
  return {
    id,
    type: 'line',
    points: [[0, 0], [100, 100]],
    stroke: 'currentColor',
    strokeWidth: 2,
    startBinding: null,
    endBinding: null,
  }
}

function mountPanel() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDiagramsStore()
  const wrapper = mount(DiagramStylePanel, {
    global: { plugins: [pinia] },
  })
  return { wrapper, store, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramStylePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('panel is not rendered when no element is selected', () => {
    const { wrapper, store } = mountPanel()
    store.selectedIds = []

    expect(wrapper.find('[role="group"][aria-label="Style panel"]').exists()).toBe(false)
  })

  it('panel renders when at least one element is selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="group"][aria-label="Style panel"]').exists()).toBe(true)
  })

  it('stroke color section is always visible when selection is non-empty', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Stroke color"]').exists()).toBe(true)
  })

  it('fill section is visible when a shape is selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Fill color"]').exists()).toBe(true)
  })

  it('fill section is NOT visible when only a line is selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeLine('l1')]
    store.selectedIds = ['l1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Fill color"]').exists()).toBe(false)
  })

  it('font size section is visible when a text element is selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeText('t1')]
    store.selectedIds = ['t1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Font size"]').exists()).toBe(true)
  })

  it('font size section is NOT visible when only non-text elements are selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Font size"]').exists()).toBe(false)
  })

  it('stroke width section is visible for non-text elements', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeLine('l1')]
    store.selectedIds = ['l1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Stroke width"]').exists()).toBe(true)
  })

  it('stroke width section is NOT visible when only text is selected', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeText('t1')]
    store.selectedIds = ['t1']

    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Stroke width"]').exists()).toBe(false)
  })

  it('clicking a stroke swatch calls store.applyStyle with the correct stroke value', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    const applySpy = vi.spyOn(store, 'applyStyle')
    await wrapper.vm.$nextTick()

    const redSwatch = wrapper.find('button[aria-label="Red"]')
    expect(redSwatch.exists()).toBe(true)

    await redSwatch.trigger('click')

    expect(applySpy).toHaveBeenCalledWith({ stroke: '#e03131' })
  })

  it('clicking the blue fill swatch calls store.applyStyle with fill value', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    const applySpy = vi.spyOn(store, 'applyStyle')
    await wrapper.vm.$nextTick()

    const blueFill = wrapper.find('button[aria-label="Blue fill"]')
    expect(blueFill.exists()).toBe(true)

    await blueFill.trigger('click')

    expect(applySpy).toHaveBeenCalledWith({ fill: '#1971c2' })
  })

  it('clicking the no-fill swatch calls store.applyStyle with fill: null', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    const applySpy = vi.spyOn(store, 'applyStyle')
    await wrapper.vm.$nextTick()

    const noFill = wrapper.find('button[aria-label="No fill"]')
    expect(noFill.exists()).toBe(true)

    await noFill.trigger('click')

    expect(applySpy).toHaveBeenCalledWith({ fill: null })
  })

  it('clicking the Thick stroke width button calls applyStyle with strokeWidth: 4', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    const applySpy = vi.spyOn(store, 'applyStyle')
    await wrapper.vm.$nextTick()

    const thickBtn = wrapper.find('button[aria-label="Thick"]')
    expect(thickBtn.exists()).toBe(true)

    await thickBtn.trigger('click')

    expect(applySpy).toHaveBeenCalledWith({ strokeWidth: 4 })
  })

  it('clicking the L font size button calls applyStyle with fontSize: 24', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeText('t1')]
    store.selectedIds = ['t1']

    const applySpy = vi.spyOn(store, 'applyStyle')
    await wrapper.vm.$nextTick()

    const lBtn = wrapper.find('button[aria-label="L"]')
    expect(lBtn.exists()).toBe(true)

    await lBtn.trigger('click')

    expect(applySpy).toHaveBeenCalledWith({ fontSize: 24 })
  })

  it('active stroke swatch has aria-pressed=true when all selected elements share that stroke', async () => {
    const { wrapper, store } = mountPanel()
    const rect = makeRectangle('r1')
    // rect already has stroke: 'currentColor'
    store.elements = [rect]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const defaultSwatch = wrapper.find('button[aria-label="Theme default"]')
    expect(defaultSwatch.exists()).toBe(true)
    expect(defaultSwatch.attributes('aria-pressed')).toBe('true')
  })

  it('no stroke swatch has aria-pressed=true when elements have different strokes', async () => {
    const { wrapper, store } = mountPanel()
    const r1: DiagramElement = { ...makeRectangle('r1'), stroke: '#e03131' }
    const r2: DiagramElement = { ...makeRectangle('r2'), stroke: '#2f9e44' }
    store.elements = [r1, r2]
    store.selectedIds = ['r1', 'r2']

    await wrapper.vm.$nextTick()

    // None of the STROKE palette buttons should be pressed when strokes differ
    const strokeGroup = wrapper.find('[aria-label="Stroke color"]')
    expect(strokeGroup.exists()).toBe(true)
    const strokeSwatches = strokeGroup.findAll('.style-panel__swatch')
    for (const swatch of strokeSwatches) {
      expect(swatch.attributes('aria-pressed')).toBe('false')
    }
  })

  // ── New cases: redesigned markup ────────────────────────────────────────────

  it('matching stroke swatch has active ring class applied', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [{ ...makeRectangle('r1'), stroke: '#e03131' }]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const redSwatch = wrapper.find('button[aria-label="Red"]')
    expect(redSwatch.exists()).toBe(true)
    expect(redSwatch.classes()).toContain('style-panel__swatch--active')
  })

  it('non-matching stroke swatches do not have active ring class', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [{ ...makeRectangle('r1'), stroke: '#e03131' }]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const greenSwatch = wrapper.find('button[aria-label="Green"]')
    expect(greenSwatch.exists()).toBe(true)
    expect(greenSwatch.classes()).not.toContain('style-panel__swatch--active')
  })

  it('no swatch has active ring class on mixed-selection stroke', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [
      { ...makeRectangle('r1'), stroke: '#e03131' },
      { ...makeRectangle('r2'), stroke: '#2f9e44' },
    ]
    store.selectedIds = ['r1', 'r2']

    await wrapper.vm.$nextTick()

    const strokeGroup = wrapper.find('[aria-label="Stroke color"]')
    const swatches = strokeGroup.findAll('.style-panel__swatch')
    for (const swatch of swatches) {
      expect(swatch.classes()).not.toContain('style-panel__swatch--active')
    }
  })

  it('no fill swatch has active ring class on mixed-selection fill', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [
      { ...makeRectangle('r1'), fill: '#e03131' },
      { ...makeRectangle('r2'), fill: '#2f9e44' },
    ]
    store.selectedIds = ['r1', 'r2']

    await wrapper.vm.$nextTick()

    const fillGroup = wrapper.find('[aria-label="Fill color"]')
    const swatches = fillGroup.findAll('.style-panel__swatch')
    for (const swatch of swatches) {
      expect(swatch.classes()).not.toContain('style-panel__swatch--active')
    }
  })

  it('stroke width buttons render line-weight preview elements', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const widthGroup = wrapper.find('[aria-label="Stroke width"]')
    const buttons = widthGroup.findAll('button')

    // Each width button must contain a line-preview bar
    for (const btn of buttons) {
      expect(btn.find('.style-panel__line-preview-bar').exists()).toBe(true)
    }
  })

  it('Thin width button has a thinner preview bar than Thick', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const thinBar = wrapper.find('button[aria-label="Thin"] .style-panel__line-preview-bar')
    const thickBar = wrapper.find('button[aria-label="Thick"] .style-panel__line-preview-bar')

    expect(thinBar.exists()).toBe(true)
    expect(thickBar.exists()).toBe(true)

    // The height style is set inline — thin should be 1.5px, thick should be 4px
    const thinStyle = thinBar.attributes('style') ?? ''
    const thickStyle = thickBar.attributes('style') ?? ''

    expect(thinStyle).toContain('1.5px')
    expect(thickStyle).toContain('4px')
  })

  it('active font size button has active class and aria-pressed=true', async () => {
    const { wrapper, store } = mountPanel()
    // makeText sets fontSize: 16 (M)
    store.elements = [makeText('t1')]
    store.selectedIds = ['t1']

    await wrapper.vm.$nextTick()

    const mBtn = wrapper.find('button[aria-label="M"]')
    expect(mBtn.exists()).toBe(true)
    expect(mBtn.classes()).toContain('style-panel__btn--active')
    expect(mBtn.attributes('aria-pressed')).toBe('true')

    const sBtn = wrapper.find('button[aria-label="S"]')
    expect(sBtn.classes()).not.toContain('style-panel__btn--active')
  })

  it('no fill swatch renders an SVG diagonal-slash indicator', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]
    store.selectedIds = ['r1']

    await wrapper.vm.$nextTick()

    const noFillBtn = wrapper.find('button[aria-label="No fill"]')
    expect(noFillBtn.exists()).toBe(true)
    // Should contain a svg element for the diagonal slash
    expect(noFillBtn.find('svg').exists()).toBe(true)
  })

  it('panel appears only when selection is non-empty', async () => {
    const { wrapper, store } = mountPanel()
    store.elements = [makeRectangle('r1')]

    // Initially no selection
    store.selectedIds = []
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="group"][aria-label="Style panel"]').exists()).toBe(false)

    // Select an element
    store.selectedIds = ['r1']
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="group"][aria-label="Style panel"]').exists()).toBe(true)

    // Deselect
    store.selectedIds = []
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="group"][aria-label="Style panel"]').exists()).toBe(false)
  })
})
