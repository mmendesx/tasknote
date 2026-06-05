import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramToolbar from '../DiagramToolbar.vue'
import { useDiagramsStore } from '@/stores/diagrams'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountToolbar() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDiagramsStore()
  const wrapper = mount(DiagramToolbar, {
    global: { plugins: [pinia] },
  })
  return { wrapper, store, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramToolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('clicking the rectangle tool button sets store.tool to rectangle and aria-pressed reflects it', async () => {
    const { wrapper, store } = mountToolbar()

    const rectBtn = wrapper.find('button[aria-label="Rectangle"]')
    expect(rectBtn.exists()).toBe(true)

    await rectBtn.trigger('click')

    expect(store.tool).toBe('rectangle')
    expect(rectBtn.attributes('aria-pressed')).toBe('true')

    // Previously active button (select) should no longer be pressed
    const selectBtn = wrapper.find('button[aria-label="Select"]')
    expect(selectBtn.attributes('aria-pressed')).toBe('false')
  })

  it('clicking the hand tool button sets store.tool to hand', async () => {
    const { wrapper, store } = mountToolbar()

    const handBtn = wrapper.find('button[aria-label="Hand (pan)"]')
    expect(handBtn.exists()).toBe(true)

    await handBtn.trigger('click')

    expect(store.tool).toBe('hand')
    expect(handBtn.attributes('aria-pressed')).toBe('true')
  })

  it('save indicator shows Saving while store.saving is true, and Saved when not dirty and not saving', async () => {
    const { wrapper, pinia } = mountToolbar()

    const state = pinia.state.value['diagrams']

    // Default state: not dirty, not saving → "Saved"
    await wrapper.vm.$nextTick()
    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.text()).toBe('Saved')

    // Simulate saving
    state.saving = true
    await wrapper.vm.$nextTick()
    expect(indicator.text()).toBe('Saving…')

    // Done saving, clean
    state.saving = false
    state.dirty = false
    await wrapper.vm.$nextTick()
    expect(indicator.text()).toBe('Saved')

    // Dirty but not saving
    state.dirty = true
    await wrapper.vm.$nextTick()
    expect(indicator.text()).toBe('Unsaved')
  })

  it('zoom-in button increases store.viewport.zoom and clamps at 5', async () => {
    const { wrapper, pinia } = mountToolbar()

    const state = pinia.state.value['diagrams']

    // Normal zoom-in from 1
    const zoomInBtn = wrapper.find('button[aria-label="Zoom in"]')
    expect(zoomInBtn.exists()).toBe(true)

    await zoomInBtn.trigger('click')
    expect(state.viewport.zoom).toBeCloseTo(1.1, 5)

    // Set near max and click zoom-in: must clamp at 5
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 4.99 }
    await zoomInBtn.trigger('click')
    expect(state.viewport.zoom).toBeLessThanOrEqual(5)
    expect(state.viewport.zoom).toBe(5)

    // Clicking zoom-in at max stays at 5
    await zoomInBtn.trigger('click')
    expect(state.viewport.zoom).toBe(5)
  })

  it('zoom-out button decreases store.viewport.zoom and clamps at 0.1', async () => {
    const { wrapper, pinia } = mountToolbar()

    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }

    const zoomOutBtn = wrapper.find('button[aria-label="Zoom out"]')
    expect(zoomOutBtn.exists()).toBe(true)

    await zoomOutBtn.trigger('click')
    expect(state.viewport.zoom).toBeCloseTo(1 / 1.1, 5)

    // Set near min and click zoom-out: must clamp at 0.1
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 0.11 }
    await zoomOutBtn.trigger('click')
    expect(state.viewport.zoom).toBeGreaterThanOrEqual(0.1)
  })
})
