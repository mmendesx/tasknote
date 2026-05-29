/**
 * ICT-77 — DOM-level reactivity tests for the board.
 *
 * These tests mount KanbanColumn with a real Pinia currentBoard store and
 * assert that the RENDERED DOM updates after store mutations — without a
 * full remount. They are the definitive regression guard for the in-place
 * mutation bug (tasks mutated via splice/Object.assign left localTasks stale).
 *
 * SCN-1  createTask   → new card appears in the column DOM
 * SCN-2  updateTask   → card title updates in-place
 * SCN-3  moveTask     → source column shows "No tasks"; target shows the card
 * SCN-4  softDeleteTask → card disappears from DOM
 * SCN-5  moveTask rollback → optimistic move appears; on API failure the card
 *                            returns to the source column
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import type { ColumnWithTasks } from '@tasknote/shared'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: () => ({ option: vi.fn() }),
}))

vi.mock('@/composables/useIsDesktop', () => ({
  useIsDesktop: () => ({ value: true }),
}))

vi.mock('@/composables/useAnime', () => ({
  useAnime: () => ({
    animate: vi.fn(),
    prefersReducedMotion: { value: false },
  }),
}))

vi.mock('@tasknote/ui', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
  DropdownMenu: {
    name: 'DropdownMenu',
    template: '<div><slot name="trigger" /></div>',
    props: ['items', 'side', 'align'],
  },
}))

vi.mock('@/api', () => ({
  tasks: {
    moveTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  boards: { getBoard: vi.fn() },
  columns: { reorderColumns: vi.fn() },
  tags: {
    addTagToTask: vi.fn(),
    removeTagFromTask: vi.fn(),
  },
}))

// ─── Imports (after mocks) ─────────────────────────────────────────────────────

import { useCurrentBoardStore } from '@/stores/currentBoard'
import * as api from '@/api'
import KanbanColumn from '../KanbanColumn.vue'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTask(id: number, title: string, columnId: number) {
  return {
    id,
    column_id: columnId,
    title,
    description_md: null,
    priority: 'medium' as const,
    due_date: null,
    position: 0,
    archived_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function makeBoard() {
  return {
    id: 1,
    name: 'Test Board',
    position: 0,
    created_at: new Date(),
    updated_at: new Date(),
    columns: [
      {
        id: 10,
        board_id: 1,
        name: 'Backlog',
        color: '#ccc',
        wip_limit: null,
        is_done: false,
        position: 0,
        tasks: [makeTask(100, 'Task Alpha', 10)],
      },
      {
        id: 11,
        board_id: 1,
        name: 'Doing',
        color: '#ccc',
        wip_limit: null,
        is_done: false,
        position: 1,
        tasks: [],
      },
    ],
  }
}

/**
 * Mounts a thin wrapper that renders KanbanColumn for every column on the
 * store's board. This lets us assert cross-column DOM changes (SCN-3, SCN-5)
 * without needing to wire up BoardView (vue-router, useSortable on the
 * columns level, etc.).
 */
function mountBoardColumns(store: ReturnType<typeof useCurrentBoardStore>) {
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(
          'div',
          store.board!.columns.map((col: ColumnWithTasks) =>
            h(KanbanColumn, { key: col.id, column: col, 'data-col-id': col.id })
          )
        )
    },
  })

  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(Wrapper, {
    global: { plugins: [pinia] },
  })
}

/**
 * Mount a single KanbanColumn driven by a reactive store column reference.
 */
function mountSingleColumn(
  store: ReturnType<typeof useCurrentBoardStore>,
  colId: number
) {
  const Wrapper = defineComponent({
    setup() {
      return () => {
        const col = store.board?.columns.find((c: ColumnWithTasks) => c.id === colId)
        return col ? h(KanbanColumn, { column: col }) : h('div')
      }
    },
  })

  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(Wrapper, {
    global: { plugins: [pinia] },
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ICT-77 SCN-1 — createTask renders the new card without remount', () => {
  let store: ReturnType<typeof useCurrentBoardStore>

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeBoard()
    vi.resetAllMocks()
  })

  it('new task title appears in the column after createTask resolves', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValueOnce(
      makeTask(200, 'Brand New Task', 10) as never
    )

    const wrapper = mountSingleColumn(store, 10)

    // Pre-condition: only one card
    expect(wrapper.findAll('.task-card')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Brand New Task')

    await store.createTask(10, { title: 'Brand New Task', column_id: 10, priority: 'medium' })
    await flushPromises()

    // Post-fix expectation: DOM shows the new card
    expect(wrapper.findAll('.task-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Brand New Task')
  })

  it('optimistic temp card appears immediately (before API resolves)', async () => {
    let resolveApi!: (v: unknown) => void
    vi.mocked(api.tasks.createTask).mockReturnValueOnce(
      new Promise((res) => { resolveApi = res }) as Promise<never>
    )

    const wrapper = mountSingleColumn(store, 10)
    const createPromise = store.createTask(10, { title: 'Optimistic Task', column_id: 10, priority: 'low' })

    await flushPromises()

    // Optimistic: temp card should be visible right away
    expect(wrapper.text()).toContain('Optimistic Task')

    resolveApi(makeTask(201, 'Optimistic Task', 10))
    await createPromise
    await flushPromises()

    expect(wrapper.text()).toContain('Optimistic Task')
  })
})

describe('ICT-77 SCN-2 — updateTask reflects title change without remount', () => {
  let store: ReturnType<typeof useCurrentBoardStore>

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeBoard()
    vi.resetAllMocks()
  })

  it('updated title appears in the DOM after updateTask resolves', async () => {
    vi.mocked(api.tasks.updateTask).mockResolvedValueOnce(undefined as never)

    const wrapper = mountSingleColumn(store, 10)
    expect(wrapper.text()).toContain('Task Alpha')

    await store.updateTask(100, { title: 'Updated Title' })
    await flushPromises()

    expect(wrapper.text()).toContain('Updated Title')
    expect(wrapper.text()).not.toContain('Task Alpha')
  })
})

describe('ICT-77 SCN-3 — moveTask: empty-state and card transfer across columns', () => {
  let store: ReturnType<typeof useCurrentBoardStore>

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeBoard()
    vi.resetAllMocks()
  })

  it('source column shows "No tasks" after its only task is moved out', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValueOnce(undefined as never)

    const wrapper = mountBoardColumns(store)

    // Both columns rendered before the move
    const backlogSection = () => wrapper.findAll('section')[0]
    const doingSection = () => wrapper.findAll('section')[1]

    expect(backlogSection().text()).toContain('Task Alpha')
    expect(doingSection().find('.kanban-column__empty').exists()).toBe(true)

    await store.moveTask(100, 11, 0)
    await flushPromises()

    // Source: empty state visible, card gone
    expect(backlogSection().find('.kanban-column__empty').exists()).toBe(true)
    expect(backlogSection().text()).not.toContain('Task Alpha')

    // Target: card visible, empty state gone
    expect(doingSection().find('.kanban-column__empty').exists()).toBe(false)
    expect(doingSection().text()).toContain('Task Alpha')
  })
})

describe('ICT-77 SCN-4 — softDeleteTask: card removed from DOM', () => {
  let store: ReturnType<typeof useCurrentBoardStore>

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeBoard()
    vi.resetAllMocks()
  })

  it('card disappears and empty state shows after delete', async () => {
    vi.mocked(api.tasks.deleteTask).mockResolvedValueOnce(undefined as never)

    const wrapper = mountSingleColumn(store, 10)
    expect(wrapper.findAll('.task-card')).toHaveLength(1)
    expect(wrapper.find('.kanban-column__empty').exists()).toBe(false)

    await store.softDeleteTask(100)
    await flushPromises()

    expect(wrapper.findAll('.task-card')).toHaveLength(0)
    expect(wrapper.find('.kanban-column__empty').exists()).toBe(true)
  })
})

describe('ICT-77 SCN-5 — moveTask rollback: optimistic move shows, then reverts on API failure', () => {
  let store: ReturnType<typeof useCurrentBoardStore>

  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeBoard()
    vi.resetAllMocks()
  })

  it('card appears in target column optimistically, then returns to source on rejection', async () => {
    let rejectApi!: (err: Error) => void
    vi.mocked(api.tasks.moveTask).mockReturnValueOnce(
      new Promise<never>((_, rej) => { rejectApi = rej })
    )

    const wrapper = mountBoardColumns(store)
    const backlogSection = () => wrapper.findAll('section')[0]
    const doingSection = () => wrapper.findAll('section')[1]

    const movePromise = store.moveTask(100, 11, 0)
    await flushPromises()

    // Optimistic: card should be in target column
    expect(doingSection().text()).toContain('Task Alpha')
    expect(backlogSection().find('.kanban-column__empty').exists()).toBe(true)

    // Reject the API call → rollback
    rejectApi(new Error('Network error'))
    await expect(movePromise).rejects.toThrow()
    await flushPromises()

    // After rollback: card is back in source
    expect(backlogSection().text()).toContain('Task Alpha')
    expect(doingSection().find('.kanban-column__empty').exists()).toBe(true)
  })
})
