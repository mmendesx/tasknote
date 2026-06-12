/**
 * ICT-4 — Top-bar export menu + save indicator
 *
 * These tests cover the export dropdown and save-status indicator that live in
 * DiagramsView's detail header after the DiagramToolbar retirement.
 *
 * Zoom/undo/redo are already covered by DiagramZoomCluster.spec.ts.
 * Tool palette is covered by DiagramToolPalette.spec.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import DiagramsView from '../DiagramsView.vue'
import type { DiagramElement } from '@tasknote/shared'

// ── Module-level spies (hoisted so vi.mock factory can capture them) ──────────

const toastErrorSpy = vi.hoisted(() => vi.fn())

vi.mock('@tasknote/ui', () => ({
  useToast: () => ({ error: toastErrorSpy, success: vi.fn() }),
  Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  Tooltip: {
    name: 'Tooltip',
    props: ['content', 'side', 'delayDuration'],
    template: '<slot />',
  },
  // Render the dropdown trigger slot directly so we can find + click the trigger
  // button, and expose a data-testid shim for each item so we can invoke onSelect.
  // We use a computed getter so the rendered list stays reactive to prop changes.
  DropdownMenu: {
    name: 'DropdownMenu',
    props: ['items', 'align', 'side'],
    computed: {
      itemList() {
        return (this as unknown as { items: Array<{ type: string }> }).items.filter(
          (it) => it.type === 'item',
        )
      },
    },
    template: `
      <div>
        <slot name="trigger" />
        <div data-testid="dropdown-items">
          <button
            v-for="(item, i) in itemList"
            :key="i"
            :data-testid="'dropdown-item-' + item.label.toLowerCase().replace(/\\s+/g, '-')"
            :disabled="item.disabled || undefined"
            @click="!item.disabled && item.onSelect()"
          >{{ item.label }}</button>
        </div>
      </div>
    `,
  },
}))

vi.mock('@/api', () => ({
  diagrams: {
    listDiagrams: vi.fn().mockResolvedValue([]),
    createDiagram: vi.fn().mockResolvedValue({ id: 42, title: 'New diagram' }),
    deleteDiagram: vi.fn().mockResolvedValue(undefined),
    getDiagram: vi.fn().mockResolvedValue({
      id: 42,
      title: 'My Diagram',
      scene_json: {
        version: 1,
        elements: [],
        appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
      },
    }),
    updateDiagram: vi.fn().mockResolvedValue({}),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRouter(path = '/diagrams/42') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/diagrams', name: 'diagrams', component: DiagramsView },
      { path: '/diagrams/:id', name: 'diagram-detail', component: DiagramsView },
    ],
  })
  router.push(path)
  return router
}

async function mountDetailView(path = '/diagrams/42') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = makeRouter(path)
  await router.isReady()

  const wrapper = mount(DiagramsView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        teleport: true,
        DiagramCanvas: { template: '<div data-testid="diagram-canvas" />' },
        DiagramStylePanel: { template: '<div />' },
        DiagramToolPalette: { template: '<div />' },
        DiagramZoomCluster: { template: '<div />' },
      },
    },
  })

  await flushPromises()
  return { wrapper, pinia }
}

function makeElement(): DiagramElement {
  return {
    id: 'r1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    stroke: '#333',
    fill: null,
    strokeWidth: 2,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramsView top bar — save indicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows "Saved" in the aria-live region when store is clean', async () => {
    const { wrapper } = await mountDetailView()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.text()).toContain('Saved')
  })

  it('shows "Saving…" when store.saving is true', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].saving = true
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.text()).toContain('Saving…')
  })

  it('shows "Unsaved" when store.dirty is true and not saving', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].dirty = true
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.text()).toContain('Unsaved')
  })

  it('shows "Save failed — retrying" when store.saveError is set', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].saveError = 'Network error'
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.text()).toContain('Save failed — retrying')
  })

  it('clears the error message when saveError is reset to null', async () => {
    const { wrapper, pinia } = await mountDetailView()

    const state = pinia.state.value['diagrams']
    state.saveError = 'Network error'
    await wrapper.vm.$nextTick()

    state.saveError = null
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.text()).toContain('Saved')
  })

  it('indicator element has aria-atomic="true"', async () => {
    const { wrapper } = await mountDetailView()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.attributes('aria-atomic')).toBe('true')
  })

  it('indicator applies --saving modifier class when saving', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].saving = true
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.classes()).toContain('diagrams-view__save-indicator--saving')
  })

  it('indicator applies --failed modifier class when saveError is set', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].saveError = 'err'
    await wrapper.vm.$nextTick()

    const indicator = wrapper.find('[aria-live="polite"]')
    expect(indicator.classes()).toContain('diagrams-view__save-indicator--failed')
  })
})

describe('DiagramsView top bar — export dropdown', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Export trigger button is disabled when diagram has no elements', async () => {
    const { wrapper } = await mountDetailView()
    // store.elements defaults to []
    const trigger = wrapper.find('button[aria-label="Export diagram"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('disabled')).toBeDefined()
  })

  it('Export trigger button is enabled when diagram has elements', async () => {
    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].elements = [makeElement()]
    await wrapper.vm.$nextTick()

    const trigger = wrapper.find('button[aria-label="Export diagram"]')
    expect(trigger.attributes('disabled')).toBeUndefined()
  })

  it('Export SVG item is disabled when there are no elements', async () => {
    const { wrapper } = await mountDetailView()

    const svgItem = wrapper.find('[data-testid="dropdown-item-export-svg"]')
    expect(svgItem.exists()).toBe(true)
    expect(svgItem.attributes('disabled')).toBeDefined()
  })

  it('Export PNG item is disabled when there are no elements', async () => {
    const { wrapper } = await mountDetailView()

    const pngItem = wrapper.find('[data-testid="dropdown-item-export-png"]')
    expect(pngItem.exists()).toBe(true)
    expect(pngItem.attributes('disabled')).toBeDefined()
  })

  it('clicking Export SVG calls exportSvg with store elements and title', async () => {
    const exportModule = await import('../exportDiagram')
    const exportSvgSpy = vi.spyOn(exportModule, 'exportSvg').mockImplementation(() => {})

    const { wrapper, pinia } = await mountDetailView()

    const state = pinia.state.value['diagrams']
    state.elements = [makeElement()]
    state.title = 'My Diagram'
    await wrapper.vm.$nextTick()

    const svgItem = wrapper.find('[data-testid="dropdown-item-export-svg"]')
    await svgItem.trigger('click')

    expect(exportSvgSpy).toHaveBeenCalledOnce()
    expect(exportSvgSpy.mock.calls[0]![0]).toEqual([makeElement()])
    expect(exportSvgSpy.mock.calls[0]![1]).toBe('My Diagram')

    exportSvgSpy.mockRestore()
  })

  it('Export PNG failure shows an error toast', async () => {
    const exportModule = await import('../exportDiagram')
    const exportPngSpy = vi
      .spyOn(exportModule, 'exportPng')
      .mockRejectedValue(new Error('PNG export failed: image decode error'))

    toastErrorSpy.mockClear()

    const { wrapper, pinia } = await mountDetailView()

    pinia.state.value['diagrams'].elements = [makeElement()]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="dropdown-item-export-png"]').trigger('click')
    await flushPromises()

    expect(toastErrorSpy).toHaveBeenCalledOnce()
    expect(toastErrorSpy.mock.calls[0]![0]).toMatch(/png export failed/i)

    exportPngSpy.mockRestore()
  })
})
