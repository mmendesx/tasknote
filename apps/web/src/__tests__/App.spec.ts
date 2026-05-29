/**
 * Regression test: Transition mode="out-in" deadlock after Settings navigation
 *
 * Bug: App.vue used <Transition name="page" mode="out-in">. In a real browser this
 * deadlocked — after visiting the Settings view the leaving view's `transitionend`
 * never fired, so the incoming view stayed permanently unmounted. Every subsequent
 * navigation produced a blank #main-content. No JS error; silent blank render.
 *
 * Fix: removed mode="out-in" (simultaneous transitions only).
 *
 * Two guards live here:
 *
 *   1. SOURCE GUARD (primary, deterministic): reads App.vue's raw source and asserts
 *      mode="out-in" is absent from the Transition that wraps RouterView.
 *      This is the structural regression test — it fails the instant the attribute is
 *      re-added, regardless of jsdom's CSS transition handling.
 *
 *   2. MOUNT SMOKE TEST (supplementary): mounts App with real view components and a
 *      memory router, drives settings→today navigation, asserts TodayView mounts.
 *      jsdom does NOT run CSS transitions, so it cannot reproduce the transitionend
 *      deadlock itself. The source guard is what actually guards the regression.
 *      This smoke test proves the navigation flow renders without crashing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that trigger them
// ---------------------------------------------------------------------------

vi.mock('@/api', () => ({
  settings: {
    getSettings: vi.fn().mockResolvedValue({
      id: 1,
      display_name: 'Test User',
      theme: 'light',
      accent: '#6366f1',
      onboarded_at: '2026-01-01T00:00:00.000Z',
      created_at: new Date(),
      updated_at: new Date(),
    }),
    patchSettings: vi.fn(),
    onboard: vi.fn(),
  },
  tasks: {
    listToday: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  boards: {
    getBoard: vi.fn().mockResolvedValue(null),
    listBoards: vi.fn().mockResolvedValue([]),
  },
  columns: {
    reorderColumns: vi.fn(),
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
  search: {
    search: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@tasknote/ui', () => ({
  Toast: { template: '<div />' },
  Button: { template: '<button><slot /></button>', props: ['disabled', 'variant', 'size'] },
  Input: { template: '<input />', props: ['modelValue', 'disabled', 'placeholder'] },
  Dialog: { template: '<div><slot /></div>', props: ['open'] },
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}))

vi.mock('@/composables/useAnime', () => ({
  animateOrSkip: vi.fn().mockReturnValue({ finished: Promise.resolve() }),
  useAnime: () => ({}),
}))

vi.mock('@/composables/useShortcuts', () => ({
  useShortcuts: () => ({ install: vi.fn() }),
  onShortcut: vi.fn(),
  triggerShortcut: vi.fn(),
}))

vi.mock('@/composables/useCommandPalette', () => ({
  useCommandPalette: () => ({ open: false }),
}))

vi.mock('@/features/search/useCommandPalette', () => ({
  useCommandPalette: () => ({ open: false }),
}))

vi.mock('@/features/notes/NoteList.vue', () => ({
  default: { template: '<div />' },
}))

// ---------------------------------------------------------------------------
// Lazy imports after mocks
// ---------------------------------------------------------------------------

import App from '@/App.vue'
import TodayView from '@/views/TodayView.vue'
import SettingsView from '@/views/SettingsView.vue'
import BoardView from '@/features/board/BoardView.vue'
import NotesView from '@/views/NotesView.vue'
import ArchiveView from '@/views/ArchiveView.vue'

// ---------------------------------------------------------------------------
// 1. SOURCE GUARD — primary regression test
// ---------------------------------------------------------------------------

describe('App.vue source guard: Transition must not use mode="out-in"', () => {
  it('does not contain mode="out-in" on the RouterView Transition', () => {
    const appSource = readFileSync(
      resolve(__dirname, '../App.vue'),
      'utf-8'
    )

    // The bug was exactly this attribute being present on the Transition wrapping RouterView.
    // This test fails the instant someone re-adds mode="out-in".
    // The regex matches only the attribute on a Transition tag (not in HTML comments),
    // by anchoring to a < that starts a tag and excluding comment lines.
    const templateSection = appSource.slice(appSource.indexOf('<template>'))
    // Strip HTML comments so the comment documenting the bug doesn't false-positive
    const withoutComments = templateSection.replace(/<!--[\s\S]*?-->/g, '')
    expect(withoutComments).not.toMatch(/mode\s*=\s*["']out-in["']/)
  })

  it('retains a Transition element wrapping the RouterView slot', () => {
    const appSource = readFileSync(
      resolve(__dirname, '../App.vue'),
      'utf-8'
    )

    // The Transition should still exist — we want the fade, just not the deadlocking mode
    expect(appSource).toMatch(/<Transition\b/)
    expect(appSource).toMatch(/name\s*=\s*["']page["']/)
  })
})

// ---------------------------------------------------------------------------
// 2. MOUNT SMOKE TEST — supplementary navigation guard
//
// jsdom does not run CSS transitions so it cannot replay the transitionend
// deadlock. What this does prove: after navigating to Settings and then away,
// the next view's root component mounts (is not stuck unmounted). The source
// guard above is what actually catches a mode="out-in" re-introduction.
// ---------------------------------------------------------------------------

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'board-default', component: BoardView },
      { path: '/today', name: 'today', component: TodayView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/notes', name: 'notes', component: NotesView },
      { path: '/archive', name: 'archive', component: ArchiveView },
    ],
  })
}

describe('App.vue mount smoke test: views render after settings navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('mounts TodayView after navigating settings → today', async () => {
    const router = buildRouter()
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(App, {
      global: {
        plugins: [router, pinia],
        stubs: {
          // Stub chrome that doesn't affect routing assertions
          CommandPalette: { template: '<div />' },
          ShortcutCheatsheet: { template: '<div />' },
          OnboardingOverlay: { template: '<div />' },
          // DefaultLayout renders its default slot so RouterView is still active
          DefaultLayout: { template: '<div><slot /></div>' },
          // SettingsView sub-components
          ThemeToggle: { template: '<div />' },
          AccentPicker: { template: '<div />' },
          ConfirmResetDialog: { template: '<div />' },
          TagManager: { template: '<div />' },
          TaskDrawer: { template: '<div />' },
        },
      },
    })

    // Navigate to Settings
    await router.push('/settings')
    await flushPromises()

    expect(wrapper.findComponent(SettingsView).exists()).toBe(true)

    // Navigate away from Settings — this is where the out-in bug caused a blank
    await router.push('/today')
    await flushPromises()

    // TodayView must be mounted; if mode="out-in" deadlocks, it stays unmounted
    expect(wrapper.findComponent(TodayView).exists()).toBe(true)
    expect(wrapper.findComponent(SettingsView).exists()).toBe(false)
  })

  it('mounts SettingsView after navigating today → settings', async () => {
    const router = buildRouter()
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(App, {
      global: {
        plugins: [router, pinia],
        stubs: {
          CommandPalette: { template: '<div />' },
          ShortcutCheatsheet: { template: '<div />' },
          OnboardingOverlay: { template: '<div />' },
          DefaultLayout: { template: '<div><slot /></div>' },
          ThemeToggle: { template: '<div />' },
          AccentPicker: { template: '<div />' },
          ConfirmResetDialog: { template: '<div />' },
          TagManager: { template: '<div />' },
          TaskDrawer: { template: '<div />' },
        },
      },
    })

    await router.push('/today')
    await flushPromises()

    expect(wrapper.findComponent(TodayView).exists()).toBe(true)

    await router.push('/settings')
    await flushPromises()

    expect(wrapper.findComponent(SettingsView).exists()).toBe(true)
    expect(wrapper.findComponent(TodayView).exists()).toBe(false)
  })

  it('mounts a third view after the full settings → today → settings → notes sequence', async () => {
    const router = buildRouter()
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(App, {
      global: {
        plugins: [router, pinia],
        stubs: {
          CommandPalette: { template: '<div />' },
          ShortcutCheatsheet: { template: '<div />' },
          OnboardingOverlay: { template: '<div />' },
          DefaultLayout: { template: '<div><slot /></div>' },
          ThemeToggle: { template: '<div />' },
          AccentPicker: { template: '<div />' },
          ConfirmResetDialog: { template: '<div />' },
          TagManager: { template: '<div />' },
          TaskDrawer: { template: '<div />' },
        },
      },
    })

    await router.push('/settings')
    await flushPromises()
    await router.push('/today')
    await flushPromises()
    await router.push('/settings')
    await flushPromises()
    await router.push('/notes')
    await flushPromises()

    // After multiple settings round-trips, NotesView must still mount cleanly
    expect(wrapper.findComponent(NotesView).exists()).toBe(true)
    expect(wrapper.findComponent(SettingsView).exists()).toBe(false)
    expect(wrapper.findComponent(TodayView).exists()).toBe(false)
  })
})
