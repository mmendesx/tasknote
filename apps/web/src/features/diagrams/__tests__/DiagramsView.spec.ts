import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import DiagramsView from '../DiagramsView.vue'

// ── Toast mock (hoisted so vi.mock factory captures it) ───────────────────────

const toastErrorSpy = vi.hoisted(() => vi.fn())

vi.mock('@tasknote/ui', () => ({
  useToast: () => ({ error: toastErrorSpy, success: vi.fn() }),
  Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  Tooltip: {
    name: 'Tooltip',
    props: ['content', 'side', 'delayDuration'],
    template: '<slot />',
  },
  DropdownMenu: {
    name: 'DropdownMenu',
    props: ['items', 'align', 'side'],
    template: '<div><slot name="trigger" /></div>',
  },
}))

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('@/api', () => ({
  diagrams: {
    listDiagrams: vi.fn().mockResolvedValue([]),
    createDiagram: vi.fn().mockResolvedValue({ id: 42, title: 'New diagram' }),
    deleteDiagram: vi.fn().mockResolvedValue(undefined),
    getDiagram: vi.fn().mockResolvedValue({
      id: 42,
      title: 'New diagram',
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

function makeRouter(path = '/diagrams') {
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

interface MountOptions {
  path?: string
}

async function mountView({ path = '/diagrams' }: MountOptions = {}) {
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
  return { wrapper, pinia, router }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // BDD: creating a diagram navigates to its canvas route
  it('creating a diagram navigates to its canvas route', async () => {
    const { wrapper, router } = await mountView({ path: '/diagrams' })

    const newBtn = wrapper.find('button[aria-label*="New diagram"], button[aria-label="+ New diagram"]')
    // The teleport stub renders inline — find the primary action button
    const allBtns = wrapper.findAll('button')
    const createBtn = allBtns.find((b) => b.text().includes('New diagram'))
    expect(createBtn).toBeDefined()

    await createBtn!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('diagram-detail')
    expect(String(router.currentRoute.value.params.id)).toBe('42')
  })

  // BDD: empty diagrams state shows "No diagrams yet" when the list is empty
  it("empty diagrams state shows 'No diagrams yet' when the list is empty", async () => {
    const { wrapper } = await mountView({ path: '/diagrams' })

    expect(wrapper.text()).toContain('No diagrams yet')
  })

  // BDD: deleting the open diagram returns to the diagrams list route
  it('deleting the open diagram returns to the diagrams list route', async () => {
    const { wrapper, router } = await mountView({ path: '/diagrams/42' })

    // The detail view should be rendered (not the list)
    expect(wrapper.find('[data-testid="diagram-canvas"]').exists()).toBe(true)

    // Click the delete button (initial state — not yet pending)
    const deleteBtn = wrapper.find('button[aria-label="Delete diagram"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm deletion
    const confirmBtn = wrapper.find('button[aria-label="Confirm delete diagram"]')
    expect(confirmBtn.exists()).toBe(true)
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('diagrams')
  })

  // Guard: loading state renders spinner
  it('shows a loading spinner while the list is loading', async () => {
    // Delay the API to keep loading=true during mount render
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.listDiagrams).mockReturnValueOnce(new Promise(() => {}))

    const pinia = createPinia()
    setActivePinia(pinia)
    const router = makeRouter('/diagrams')
    await router.isReady()

    const wrapper = mount(DiagramsView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          teleport: true,
          DiagramCanvas: { template: '<div data-testid="diagram-canvas" />' },
          DiagramToolbar: { template: '<div data-testid="diagram-toolbar" />' },
        },
      },
    })

    // Before resolving the store hydration, loading should be true
    // Manually set loading state to verify the template reacts
    pinia.state.value['diagrams'].loading = true
    await wrapper.vm.$nextTick()

    const spinner = wrapper.find('.diagrams-view__spinner')
    expect(spinner.exists()).toBe(true)
  })

  // Guard: error state renders alert
  it('shows an error message when loading fails', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.listDiagrams).mockRejectedValueOnce(new Error('Network error'))

    const { wrapper } = await mountView({ path: '/diagrams' })

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Network error')
  })

  // Guard: populated list renders diagram cards
  it('renders diagram cards when the list is populated', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')
    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      { id: 1, title: 'Diagram A', scene_json: { version: 1, elements: [], appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } } } },
      { id: 2, title: 'Diagram B', scene_json: { version: 1, elements: [], appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } } } },
    ] as never[])

    const { wrapper } = await mountView({ path: '/diagrams' })

    expect(wrapper.text()).toContain('Diagram A')
    expect(wrapper.text()).toContain('Diagram B')
  })

  // Guard: NaN id falls back to list view
  it('falls back to list view when :id is not a valid number', async () => {
    const { wrapper } = await mountView({ path: '/diagrams/notanumber' })

    // Should show list view (no canvas) — list will be empty
    expect(wrapper.find('[data-testid="diagram-canvas"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No diagrams yet')
  })
})

// ── Toast deduplication (ICT-12) ──────────────────────────────────────────────

describe('DiagramsView — save-error toast deduplication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastErrorSpy.mockClear()
    vi.clearAllMocks()
  })

  it('exactly one toast per save-failure episode: consecutive failures stay at 1; recovery then new failure gives 2nd toast', async () => {
    const { pinia } = await mountView({ path: '/diagrams/42' })
    const state = pinia.state.value['diagrams']

    // Episode 1: first failure — should fire 1 toast
    state.saveError = 'Network error'
    await flushPromises()
    expect(toastErrorSpy).toHaveBeenCalledTimes(1)

    // Second failure while episode is already active — no new toast
    state.saveError = 'Timeout'
    await flushPromises()
    expect(toastErrorSpy).toHaveBeenCalledTimes(1)

    // Recovery: error cleared — episode resets
    state.saveError = null
    await flushPromises()
    expect(toastErrorSpy).toHaveBeenCalledTimes(1)

    // New independent failure — episode 2, fires a second toast
    state.saveError = 'Disconnected'
    await flushPromises()
    expect(toastErrorSpy).toHaveBeenCalledTimes(2)
  })
})
