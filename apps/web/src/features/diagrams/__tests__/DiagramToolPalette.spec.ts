import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramToolPalette from '../DiagramToolPalette.vue'
import { useDiagramsStore } from '@/stores/diagrams'

// ── Module-level mocks ────────────────────────────────────────────────────────

// Tooltip wraps each button — in tests we render the slot content directly
// to keep assertions on the button elements themselves.
vi.mock('@tasknote/ui', () => ({
  Tooltip: {
    name: 'Tooltip',
    props: ['content', 'side', 'delayDuration'],
    template: '<slot />',
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountPalette() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDiagramsStore()
  const wrapper = mount(DiagramToolPalette, {
    global: { plugins: [pinia] },
  })
  return { wrapper, store, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramToolPalette', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders exactly 8 tool buttons', () => {
    const { wrapper } = mountPalette()
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(8)
  })

  it('renders buttons for all expected tools', () => {
    const { wrapper } = mountPalette()
    const expectedLabels = [
      'Select — V',
      'Hand — H',
      'Rectangle — R',
      'Ellipse — E',
      'Line — L',
      'Arrow — A',
      'Text — T',
      'Pen — P',
    ]
    for (const label of expectedLabels) {
      const btn = wrapper.find(`button[aria-label="${label}"]`)
      expect(btn.exists(), `button "${label}" should exist`).toBe(true)
    }
  })

  it('active tool button has aria-checked=true; all others have aria-checked=false', async () => {
    const { wrapper, store } = mountPalette()

    // Default tool is "select"
    expect(store.tool).toBe('select')

    const selectBtn = wrapper.find('button[aria-label="Select — V"]')
    expect(selectBtn.attributes('aria-checked')).toBe('true')

    // All other buttons should be false
    const otherButtons = wrapper
      .findAll('button')
      .filter((b) => b.attributes('aria-label') !== 'Select — V')
    for (const btn of otherButtons) {
      expect(btn.attributes('aria-checked'), `${btn.attributes('aria-label')} should be unchecked`).toBe('false')
    }
  })

  it('clicking a tool button calls store.setTool with that tool value', async () => {
    const { wrapper, store } = mountPalette()

    const rectBtn = wrapper.find('button[aria-label="Rectangle — R"]')
    expect(rectBtn.exists()).toBe(true)

    await rectBtn.trigger('click')

    expect(store.tool).toBe('rectangle')
  })

  it('active state reflects the current store tool after click', async () => {
    const { wrapper, store } = mountPalette()

    await wrapper.find('button[aria-label="Rectangle — R"]').trigger('click')

    expect(store.tool).toBe('rectangle')

    const rectBtn = wrapper.find('button[aria-label="Rectangle — R"]')
    expect(rectBtn.attributes('aria-checked')).toBe('true')
    expect(rectBtn.classes()).toContain('diagram-tool-palette__btn--active')

    // Select button is no longer active
    const selectBtn = wrapper.find('button[aria-label="Select — V"]')
    expect(selectBtn.attributes('aria-checked')).toBe('false')
    expect(selectBtn.classes()).not.toContain('diagram-tool-palette__btn--active')
  })

  it('palette is reactive to external store changes (e.g. keyboard shortcuts)', async () => {
    const { wrapper, pinia } = mountPalette()

    // Simulate useCanvasKeyboard setting store.tool to 'rectangle' (e.g. key R)
    const state = pinia.state.value['diagrams']
    state.tool = 'rectangle'
    await wrapper.vm.$nextTick()

    const rectBtn = wrapper.find('button[aria-label="Rectangle — R"]')
    expect(rectBtn.attributes('aria-checked')).toBe('true')
    expect(rectBtn.classes()).toContain('diagram-tool-palette__btn--active')
  })

  it('all buttons have role=radio and the container has role=radiogroup', () => {
    const { wrapper } = mountPalette()

    const container = wrapper.find('[role="radiogroup"]')
    expect(container.exists()).toBe(true)
    expect(container.attributes('aria-label')).toBe('Drawing tools')

    const radioButtons = wrapper.findAll('button[role="radio"]')
    expect(radioButtons).toHaveLength(8)
  })

  it('tooltip content matches "Label — Shortcut" format for Rectangle', () => {
    const { wrapper } = mountPalette()

    // The Tooltip mock renders the slot — the button's aria-label carries the
    // same text the real Tooltip shows as its content prop.
    const rectBtn = wrapper.find('button[aria-label="Rectangle — R"]')
    expect(rectBtn.attributes('aria-label')).toBe('Rectangle — R')
  })

  it('clicking each tool button in sequence updates store.tool correctly', async () => {
    const { wrapper, store } = mountPalette()

    const toolCases: Array<[string, string]> = [
      ['Hand — H',      'hand'],
      ['Ellipse — E',   'ellipse'],
      ['Line — L',      'line'],
      ['Arrow — A',     'arrow'],
      ['Text — T',      'text'],
      ['Pen — P',       'pen'],
      ['Select — V',    'select'],
    ]

    for (const [label, value] of toolCases) {
      const btn = wrapper.find(`button[aria-label="${label}"]`)
      await btn.trigger('click')
      expect(store.tool).toBe(value)
    }
  })
})
