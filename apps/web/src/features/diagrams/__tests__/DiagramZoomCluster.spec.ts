import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramZoomCluster from '../DiagramZoomCluster.vue'
import { useDiagramsStore } from '@/stores/diagrams'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountCluster() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useDiagramsStore()
  const wrapper = mount(DiagramZoomCluster, {
    global: { plugins: [pinia] },
  })
  return { wrapper, store, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramZoomCluster', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── Rendering ────────────────────────────────────────────────────────────────

  it('renders all six controls: zoom-out, zoom-label, zoom-in, undo, redo', () => {
    const { wrapper } = mountCluster()

    expect(wrapper.find('button[aria-label="Zoom out"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Reset zoom to 100%"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Zoom in"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Undo"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Redo"]').exists()).toBe(true)
  })

  // ── Zoom percentage label ─────────────────────────────────────────────────────

  it('zoom percentage label reflects store.viewport.zoom', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']

    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1.5 }
    await wrapper.vm.$nextTick()

    const label = wrapper.find('button[aria-label="Reset zoom to 100%"]')
    expect(label.text()).toBe('150%')
  })

  it('zoom percentage label shows 100% at default zoom', () => {
    const { wrapper } = mountCluster()
    const label = wrapper.find('button[aria-label="Reset zoom to 100%"]')
    expect(label.text()).toBe('100%')
  })

  // ── Zoom in ───────────────────────────────────────────────────────────────────

  it('clicking zoom-in increases store.viewport.zoom by factor of 1.1', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }

    await wrapper.find('button[aria-label="Zoom in"]').trigger('click')

    expect(state.viewport.zoom).toBeCloseTo(1.1, 5)
  })

  it('zoom-in clamps at MAX_ZOOM (5)', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 4.99 }

    await wrapper.find('button[aria-label="Zoom in"]').trigger('click')

    expect(state.viewport.zoom).toBeLessThanOrEqual(5)
    expect(state.viewport.zoom).toBe(5)
  })

  // ── Zoom out ──────────────────────────────────────────────────────────────────

  it('clicking zoom-out decreases store.viewport.zoom by factor of 1.1', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1 }

    await wrapper.find('button[aria-label="Zoom out"]').trigger('click')

    expect(state.viewport.zoom).toBeCloseTo(1 / 1.1, 5)
  })

  it('zoom-out clamps at MIN_ZOOM (0.1)', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 0.11 }

    await wrapper.find('button[aria-label="Zoom out"]').trigger('click')

    expect(state.viewport.zoom).toBeGreaterThanOrEqual(0.1)
  })

  // ── Reset zoom ────────────────────────────────────────────────────────────────

  it('clicking the percentage label resets zoom to 100%', async () => {
    const { wrapper, pinia } = mountCluster()
    const state = pinia.state.value['diagrams']
    state.viewport = { scrollX: 0, scrollY: 0, zoom: 1.5 }

    await wrapper.find('button[aria-label="Reset zoom to 100%"]').trigger('click')

    expect(state.viewport.zoom).toBe(1)
  })

  it('reset zoom with known canvasSize keeps the scene point at viewport center fixed', async () => {
    const { wrapper, store } = mountCluster()

    store.setCanvasSize(1000, 800)
    const initialZoom = 2
    const scrollX = 50
    const scrollY = 30
    store.setViewport({ scrollX, scrollY, zoom: initialZoom })

    await wrapper.find('button[aria-label="Reset zoom to 100%"]').trigger('click')

    expect(store.viewport.zoom).toBe(1)

    const cx = 500
    const cy = 400
    const sceneX = cx / initialZoom - scrollX
    const sceneY = cy / initialZoom - scrollY
    const expectedScrollX = cx / 1 - sceneX
    const expectedScrollY = cy / 1 - sceneY

    expect(store.viewport.scrollX).toBeCloseTo(expectedScrollX, 5)
    expect(store.viewport.scrollY).toBeCloseTo(expectedScrollY, 5)
  })

  it('zoom with canvasSize 0x0 does not throw and still changes zoom', async () => {
    const { wrapper, store } = mountCluster()

    store.setViewport({ scrollX: 5, scrollY: 7, zoom: 1 })

    await expect(
      wrapper.find('button[aria-label="Zoom in"]').trigger('click'),
    ).resolves.not.toThrow()

    expect(store.viewport.zoom).toBeCloseTo(1.1, 5)
    expect(store.viewport.scrollX).toBe(5)
    expect(store.viewport.scrollY).toBe(7)
  })

  // ── Undo / redo disabled when history empty ───────────────────────────────────

  it('undo button is disabled when history is empty', () => {
    const { wrapper } = mountCluster()
    const undoBtn = wrapper.find('button[aria-label="Undo"]')

    expect(undoBtn.attributes('disabled')).toBeDefined()
  })

  it('redo button is disabled when history is empty', () => {
    const { wrapper } = mountCluster()
    const redoBtn = wrapper.find('button[aria-label="Redo"]')

    expect(redoBtn.attributes('disabled')).toBeDefined()
  })

  it('undo and redo buttons are still present (not hidden) when disabled', () => {
    const { wrapper } = mountCluster()

    expect(wrapper.find('button[aria-label="Undo"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Redo"]').exists()).toBe(true)
  })

  // ── Undo / redo enabled after an edit ─────────────────────────────────────────

  it('undo button becomes enabled after a history entry is pushed', async () => {
    const { wrapper, store } = mountCluster()

    // Push a history snapshot — this makes canUndo become true
    store.pushHistory()
    await wrapper.vm.$nextTick()

    const undoBtn = wrapper.find('button[aria-label="Undo"]')
    expect(undoBtn.attributes('disabled')).toBeUndefined()
  })

  it('redo button becomes enabled after undo creates a redo entry', async () => {
    const { wrapper, store } = mountCluster()

    store.pushHistory()
    await wrapper.vm.$nextTick()

    store.undoAction()
    await wrapper.vm.$nextTick()

    const redoBtn = wrapper.find('button[aria-label="Redo"]')
    expect(redoBtn.attributes('disabled')).toBeUndefined()
  })

  // ── Undo / redo click delegation ─────────────────────────────────────────────

  it('clicking undo calls store.undoAction', async () => {
    const { wrapper, store } = mountCluster()

    store.pushHistory()
    await wrapper.vm.$nextTick()

    const undoSpy = vi.spyOn(store, 'undoAction')

    await wrapper.find('button[aria-label="Undo"]').trigger('click')

    expect(undoSpy).toHaveBeenCalledOnce()
    undoSpy.mockRestore()
  })

  it('clicking redo calls store.redoAction', async () => {
    const { wrapper, store } = mountCluster()

    store.pushHistory()
    await wrapper.vm.$nextTick()
    store.undoAction()
    await wrapper.vm.$nextTick()

    const redoSpy = vi.spyOn(store, 'redoAction')

    await wrapper.find('button[aria-label="Redo"]').trigger('click')

    expect(redoSpy).toHaveBeenCalledOnce()
    redoSpy.mockRestore()
  })
})
