/**
 * DefaultLayout — sidebar collapse/expand regression tests
 *
 * Scope: behavior tests only. jsdom does not compute CSS transitions so we
 * cannot assert rendered pixel widths or that grid-template-columns actually
 * animates. What we pin instead:
 *
 *   - Toggling the collapse button adds/removes the correct BEM modifier
 *     classes on both .app-shell and .sidebar.
 *   - The aria-label on the toggle button reflects the current state.
 *   - Toggling is reversible (expand after collapse returns to default classes).
 *   - The collapsed class that previously set `width: 64px !important` on the
 *     sidebar element has been removed from the source — the grid track is the
 *     sole width driver (source guard).
 *   - Label elements (.logo-wordmark, .nav-item__label, .nav-section__label)
 *     do NOT have a `width` property in their transition declarations — source
 *     guard against the per-frame layout-property animation that caused jank.
 *
 * Mobile drawer behavior (transform-based, <600px) is outside this file's
 * scope — it lives on a separate class path and was explicitly not changed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/api', () => ({
  boards: {
    listBoards: vi.fn().mockResolvedValue([]),
    getBoard: vi.fn().mockResolvedValue(null),
  },
  columns: { reorderColumns: vi.fn() },
  tasks: {
    listToday: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  tags: {
    addTagToTask: vi.fn(),
    removeTagFromTask: vi.fn(),
    listTags: vi.fn().mockResolvedValue([]),
  },
  notes: {
    listNotes: vi.fn().mockResolvedValue([]),
    getNote: vi.fn(),
  },
  search: { search: vi.fn().mockResolvedValue([]) },
  settings: {
    getSettings: vi.fn().mockResolvedValue({
      id: 1,
      display_name: 'Test',
      theme: 'light',
      accent: '#6366f1',
      onboarded_at: '2026-01-01T00:00:00.000Z',
      created_at: new Date(),
      updated_at: new Date(),
    }),
    patchSettings: vi.fn(),
    onboard: vi.fn(),
  },
}))

vi.mock('@tasknote/ui', () => ({
  BrandMark: { template: '<svg />' },
  Toast: { template: '<div />' },
  Button: { template: '<button><slot /></button>', props: ['disabled', 'variant', 'size'] },
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

vi.mock('@/composables/useNavigationState', () => ({
  useNavigationState: () => ({ isNavigating: { value: false } }),
}))

vi.mock('@/features/notes/NoteList.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('@/features/diagrams/DiagramList.vue', () => ({
  default: { template: '<div />' },
}))

// ---------------------------------------------------------------------------
// Lazy imports after mocks
// ---------------------------------------------------------------------------

import DefaultLayout from '@/layouts/DefaultLayout.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'board-default', component: { template: '<div />' } }],
  })
}

function mountLayout() {
  const router = buildRouter()
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(DefaultLayout, {
    global: {
      plugins: [router, pinia],
    },
    slots: {
      default: '<div data-testid="slot-content">content</div>',
    },
  })

  return { wrapper, router, pinia }
}

// ---------------------------------------------------------------------------
// 1. SOURCE GUARDS — pin the CSS fix at the structural level
// ---------------------------------------------------------------------------

const layoutSource = readFileSync(
  resolve(__dirname, '../DefaultLayout.vue'),
  'utf-8',
)

describe('DefaultLayout source guard: animation fix', () => {
  it('sidebar does not have a width transition', () => {
    // Extract the .sidebar rule block (up to the next class rule)
    const sidebarRuleMatch = layoutSource.match(/\.sidebar\s*\{([^}]+)\}/)
    expect(sidebarRuleMatch).not.toBeNull()
    const sidebarRule = sidebarRuleMatch![1]
    expect(sidebarRule).not.toMatch(/transition/)
    expect(sidebarRule).not.toMatch(/will-change/)
  })

  it('sidebar does not have will-change: width anywhere in its own rule', () => {
    expect(layoutSource).not.toMatch(/will-change:\s*width/)
  })

  it('label transitions do not animate the width property', () => {
    // .logo-wordmark, .nav-section__label, .nav-item__label transitions
    // must only reference opacity — not width. We check all three by finding
    // their transition declarations and asserting width is absent.
    const transitionLines = layoutSource
      .split('\n')
      .filter((line) => line.includes('transition:') || line.includes('transition '))

    // Filter to only the label-related transition lines (those following the label class defs)
    // Strategy: extract the three class blocks individually
    const labelClasses = ['.logo-wordmark', '.nav-section__label', '.nav-item__label']
    for (const cls of labelClasses) {
      const idx = layoutSource.indexOf(`${cls} {`)
      expect(idx).toBeGreaterThan(-1)
      const block = layoutSource.slice(idx, layoutSource.indexOf('}', idx) + 1)
      if (block.includes('transition')) {
        // The transition must not include 'width'
        expect(block).not.toMatch(/transition:.*width/)
        expect(block).not.toMatch(/transition.*,\s*width/)
      }
    }
  })

  it('collapsed sidebar width is NOT set via width property on .sidebar--collapsed', () => {
    // The grid track alone drives the collapsed width. A `width: 64px !important`
    // on the sidebar element would create a competing layout animation source.
    const collapsedIdx = layoutSource.indexOf('.sidebar--collapsed {')
    if (collapsedIdx !== -1) {
      const block = layoutSource.slice(collapsedIdx, layoutSource.indexOf('}', collapsedIdx) + 1)
      expect(block).not.toMatch(/width\s*:/)
    }
    // The pattern `width: 64px !important` specifically must not appear targeting sidebar--collapsed
    expect(layoutSource).not.toMatch(/\.sidebar--collapsed\s*\{[^}]*width\s*:\s*64px\s*!important/)
  })
})

// ---------------------------------------------------------------------------
// 2. BEHAVIOR TESTS — sidebar toggle
// ---------------------------------------------------------------------------

describe('DefaultLayout sidebar toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without sidebar collapsed classes by default', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const shell = wrapper.find('.app-shell')
    const sidebar = wrapper.find('.sidebar')

    expect(shell.classes()).not.toContain('app-shell--sidebar-collapsed')
    expect(sidebar.classes()).not.toContain('sidebar--collapsed')
  })

  it('applies collapsed classes to app-shell and sidebar when toggle is clicked', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')
    expect(toggleBtn.exists()).toBe(true)

    await toggleBtn.trigger('click')

    const shell = wrapper.find('.app-shell')
    const sidebar = wrapper.find('.sidebar')

    expect(shell.classes()).toContain('app-shell--sidebar-collapsed')
    expect(sidebar.classes()).toContain('sidebar--collapsed')
  })

  it('removes collapsed classes when toggle is clicked a second time', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')

    await toggleBtn.trigger('click') // collapse
    await toggleBtn.trigger('click') // expand

    const shell = wrapper.find('.app-shell')
    const sidebar = wrapper.find('.sidebar')

    expect(shell.classes()).not.toContain('app-shell--sidebar-collapsed')
    expect(sidebar.classes()).not.toContain('sidebar--collapsed')
  })

  it('toggle button aria-label reads "Collapse sidebar" when expanded', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')
    expect(toggleBtn.attributes('aria-label')).toBe('Collapse sidebar')
  })

  it('toggle button aria-label reads "Expand sidebar" when collapsed', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')
    await toggleBtn.trigger('click')

    expect(toggleBtn.attributes('aria-label')).toBe('Expand sidebar')
  })

  it('toggle button aria-label returns to "Collapse sidebar" after re-expand', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')
    await toggleBtn.trigger('click') // collapse
    await toggleBtn.trigger('click') // expand

    expect(toggleBtn.attributes('aria-label')).toBe('Collapse sidebar')
  })

  it('slot content is rendered inside the layout', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    expect(wrapper.find('[data-testid="slot-content"]').exists()).toBe(true)
  })

  it('slot content remains rendered after collapsing the sidebar', async () => {
    const { wrapper } = mountLayout()
    await flushPromises()

    const toggleBtn = wrapper.find('.sidebar__collapse-btn')
    await toggleBtn.trigger('click')

    expect(wrapper.find('[data-testid="slot-content"]').exists()).toBe(true)
  })
})
