import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// --- Module mocks ---

vi.mock('@/stores/today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/today')>()
  return {
    ...actual,
    useTodayStore: vi.fn(),
  }
})

vi.mock('@/stores/boards', () => ({
  useBoardsStore: vi.fn(),
}))

vi.mock('@/api', () => ({
  tasks: {
    createTask: vi.fn(),
    listToday: vi.fn(),
    moveTask: vi.fn(),
  },
  boards: {
    getBoard: vi.fn(),
  },
}))

vi.mock('@/features/board/TaskDrawer.vue', () => ({
  default: {
    name: 'TaskDrawer',
    template: '<div data-testid="task-drawer" />',
    props: ['open', 'taskId'],
    emits: ['update:open'],
  },
}))

// Stub @tasknote/ui Button as a passthrough native button so class / disabled /
// click behave like the real control for selector-based assertions.
// DropdownMenu is stubbed to render its trigger slot plus a button per item so
// item onSelect handlers are clickable in tests.
vi.mock('@tasknote/ui', () => ({
  Button: {
    name: 'Button',
    inheritAttrs: false,
    props: ['variant', 'size', 'loading', 'disabled', 'type'],
    emits: ['click'],
    template:
      '<button :class="$attrs.class" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  DropdownMenu: {
    name: 'DropdownMenu',
    props: ['items', 'side', 'align'],
    template: `
      <div class="dropdown-stub">
        <slot name="trigger" />
        <button
          v-for="(it, i) in items"
          :key="i"
          class="dropdown-stub__item"
          :disabled="it.disabled"
          @click="it.onSelect && it.onSelect()"
        >{{ it.label }}</button>
      </div>
    `,
  },
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  }),
}))

import TodayView from '../TodayView.vue'
import { useTodayStore, localDateString } from '@/stores/today'
import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'
import type { TodayTask } from '@/api/tasks'

function makeTodayTask(
  id: number,
  carried_days: number,
  title = `Task ${id}`,
  overrides: Partial<TodayTask> = {},
): TodayTask {
  return {
    id,
    column_id: 1,
    title,
    description_md: null,
    priority: 'medium',
    due_date: null,
    committed_on: '2026-05-28',
    position: 0,
    archived_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    carried_days,
    ...overrides,
  } as TodayTask
}

interface StoreOverrides {
  list?: TodayTask[]
  loading?: boolean
  error?: string | null
  uncommit?: ReturnType<typeof vi.fn>
  toggleDone?: ReturnType<typeof vi.fn>
  restore?: ReturnType<typeof vi.fn>
  loadToday?: ReturnType<typeof vi.fn>
}

function makeStore(o: StoreOverrides = {}) {
  return {
    list: o.list ?? [],
    loading: o.loading ?? false,
    error: o.error ?? null,
    loadToday: o.loadToday ?? vi.fn().mockResolvedValue(undefined),
    uncommit: o.uncommit ?? vi.fn().mockResolvedValue(undefined),
    toggleDone: o.toggleDone ?? vi.fn().mockResolvedValue(undefined),
    restore: o.restore ?? vi.fn().mockResolvedValue(undefined),
  }
}

function mountTodayView(tasks: TodayTask[] = [], loading = false) {
  const pinia = createPinia()
  setActivePinia(pinia)

  vi.mocked(useTodayStore).mockReturnValue(
    makeStore({ list: tasks, loading }) as unknown as ReturnType<typeof useTodayStore>,
  )

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [],
    loading: false,
    error: null,
    defaultBoardId: null,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  return mount(TodayView, { global: { plugins: [pinia] } })
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe('TodayView — header', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders a "Today" heading and a human-readable date (not the raw ISO string)', () => {
    const wrapper = mountTodayView([])
    expect(wrapper.find('.today-view__title').text()).toBe('Today')

    const date = wrapper.find('.today-view__date').text()
    expect(date).not.toBe(localDateString())
    // Human format contains a weekday/month word — at least one alphabetic run.
    expect(date).toMatch(/[A-Za-z]{3,}/)
  })

  it('summarizes the task count with carried breakdown in a live region', () => {
    const tasks = [makeTodayTask(1, 2), makeTodayTask(2, 0), makeTodayTask(3, 0)]
    const wrapper = mountTodayView(tasks)
    const count = wrapper.find('.today-view__count')
    expect(count.attributes('aria-live')).toBe('polite')
    expect(count.text()).toBe('3 tasks · 1 carried over')
  })

  it('uses singular "task" and omits the carried segment when 1 fresh task', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0)])
    expect(wrapper.find('.today-view__count').text()).toBe('1 task')
  })

  it('uses empty-specific count phrasing when there are no tasks', () => {
    const wrapper = mountTodayView([])
    expect(wrapper.find('.today-view__count').text()).toBe('Nothing committed yet')
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TodayView — empty state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders empty state message when list is empty and not loading', () => {
    const wrapper = mountTodayView([])
    const emptyEl = wrapper.find('.today-view__empty')
    expect(emptyEl.exists()).toBe(true)
    expect(emptyEl.text()).toContain('Nothing committed for today')
    expect(wrapper.find('.today-list').exists()).toBe(false)
  })

  it('does not render any task rows in empty state', () => {
    const wrapper = mountTodayView([])
    expect(wrapper.findAll('.today-row')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe('TodayView — loading state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders skeleton rows (not task rows) while loading', () => {
    const wrapper = mountTodayView([], true)
    expect(wrapper.findAll('.today-skeleton').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.today-row')).toHaveLength(0)
  })

  it('announces loading via a polite live region', () => {
    const wrapper = mountTodayView([], true)
    const live = wrapper.findAll('[aria-live="polite"]').find((n) => n.text().includes('Loading'))
    expect(live).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

describe('TodayView — error state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  function mountWithError(message: string, loadToday = vi.fn()) {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(useTodayStore).mockReturnValue(
      makeStore({ error: message, loadToday }) as unknown as ReturnType<typeof useTodayStore>,
    )
    vi.mocked(useBoardsStore).mockReturnValue({
      list: [],
      defaultBoardId: null,
      load: vi.fn().mockResolvedValue(undefined),
      ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)
    return mount(TodayView, { global: { plugins: [pinia] } })
  }

  it('renders an inline error panel with the message', () => {
    const wrapper = mountWithError('Failed to load today tasks')
    const panel = wrapper.find('.today-view__error')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Failed to load today tasks')
  })

  it('Retry re-invokes loadToday(today)', async () => {
    const loadToday = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountWithError('boom', loadToday)
    await flushPromises()
    loadToday.mockClear()

    // Retry is the secondary Button inside the error panel.
    await wrapper.find('.today-view__error button').trigger('click')
    expect(loadToday).toHaveBeenCalledWith(localDateString())
  })
})

// ---------------------------------------------------------------------------
// Task list rendering
// ---------------------------------------------------------------------------

describe('TodayView — task list rendering', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders a row for each task in the list', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0), makeTodayTask(2, 0)])
    expect(wrapper.findAll('.today-row')).toHaveLength(2)
  })

  it('renders carried badge with text and accessible label when carried_days > 0', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 3)])
    const badge = wrapper.find('.today-row__carried')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('carried 3d')
    expect(badge.attributes('aria-label')).toBe('Carried 3 days')
  })

  it('does not render carried badge when carried_days is 0', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0)])
    expect(wrapper.find('.today-row__carried').exists()).toBe(false)
  })

  it('renders priority using its configured label, not the raw enum', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0, 'T', { priority: 'high' })])
    const pri = wrapper.find('.today-row__priority')
    expect(pri.text()).toBe('High')
  })

  it('marks an overdue due date with the overdue flag', () => {
    // due before today
    const wrapper = mountTodayView([
      makeTodayTask(1, 0, 'T', { due_date: '2000-01-01' }),
    ])
    const due = wrapper.find('.today-row__due')
    expect(due.exists()).toBe(true)
    expect(due.text()).toBe('Overdue')
    expect(due.attributes('data-overdue')).toBe('true')
  })

  it('preserves carried-first API ordering without re-sorting (flat list)', () => {
    // All carried so it stays a single flat list (no group split) and we can
    // assert raw order directly.
    const tasks = [
      makeTodayTask(3, 5, 'Oldest carried'),
      makeTodayTask(1, 2, 'Mid carried'),
      makeTodayTask(2, 1, 'Recent carried'),
    ]
    const wrapper = mountTodayView(tasks)
    const rows = wrapper.findAll('.today-row__title')
    expect(rows[0].text()).toBe('Oldest carried')
    expect(rows[1].text()).toBe('Mid carried')
    expect(rows[2].text()).toBe('Recent carried')
  })

  it('renders the list as ul with role=list', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0)])
    const list = wrapper.find('.today-list')
    expect(list.attributes('role')).toBe('list')
  })
})

// ---------------------------------------------------------------------------
// Grouping (ICT-9)
// ---------------------------------------------------------------------------

describe('TodayView — carried/fresh grouping', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('splits into Carried over + Today groups without changing order', () => {
    const tasks = [
      makeTodayTask(1, 3, 'Carried A'),
      makeTodayTask(2, 1, 'Carried B'),
      makeTodayTask(3, 0, 'Fresh A'),
      makeTodayTask(4, 0, 'Fresh B'),
    ]
    const wrapper = mountTodayView(tasks)

    const headings = wrapper.findAll('.today-group__heading').map((h) => h.text())
    expect(headings).toEqual(['Carried over', 'Today'])

    // Order across both groups is unchanged vs the API list, nothing dropped.
    const titles = wrapper.findAll('.today-row__title').map((t) => t.text())
    expect(titles).toEqual(['Carried A', 'Carried B', 'Fresh A', 'Fresh B'])
  })

  it('renders no group headings when all tasks are fresh', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0), makeTodayTask(2, 0)])
    expect(wrapper.findAll('.today-group__heading')).toHaveLength(0)
    expect(wrapper.findAll('.today-row')).toHaveLength(2)
  })

  it('renders no group headings when all tasks are carried', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 2), makeTodayTask(2, 4)])
    expect(wrapper.findAll('.today-group__heading')).toHaveLength(0)
    expect(wrapper.findAll('.today-row')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Row actions + announcements
// ---------------------------------------------------------------------------

describe('TodayView — row actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('done button has accessible aria-label', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0, 'My Task')])
    const doneBtn = wrapper.find('.today-row__done')
    expect(doneBtn.attributes('aria-label')).toContain("Mark 'My Task' as done")
    expect(doneBtn.text()).toContain('Done')
  })

  it('remove button has accessible aria-label conveying it marks the task done', () => {
    const wrapper = mountTodayView([makeTodayTask(1, 0, 'My Task')])
    const btn = wrapper.find('.today-row__uncommit-btn')
    expect(btn.attributes('aria-label')).toBe(
      "Remove 'My Task' from today and mark it done",
    )
  })

  it('clicking remove (−) completes the task on the board (calls toggleDone)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const toggleDone = vi.fn().mockResolvedValue(undefined)
    const uncommit = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useTodayStore).mockReturnValue(
      makeStore({
        list: [makeTodayTask(3, 0, 'My Task')],
        toggleDone,
        uncommit,
      }) as unknown as ReturnType<typeof useTodayStore>,
    )
    vi.mocked(useBoardsStore).mockReturnValue({
      list: [],
      defaultBoardId: null,
      load: vi.fn().mockResolvedValue(undefined),
      ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)
    const wrapper = mount(TodayView, { global: { plugins: [pinia] } })

    await wrapper.find('.today-row__uncommit-btn').trigger('click')
    await flushPromises()

    // Remove now completes on the board, and does NOT merely uncommit.
    expect(toggleDone).toHaveBeenCalledWith(3)
    expect(uncommit).not.toHaveBeenCalled()
    // Undo affordance is offered, same as the Done pill.
    expect(wrapper.find('.today-view__undo-btn').exists()).toBe(true)
  })

  it('clicking Done calls toggleDone and announces it', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const toggleDone = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useTodayStore).mockReturnValue(
      makeStore({ list: [makeTodayTask(1, 0, 'My Task')], toggleDone }) as unknown as ReturnType<
        typeof useTodayStore
      >,
    )
    vi.mocked(useBoardsStore).mockReturnValue({
      list: [],
      defaultBoardId: null,
      load: vi.fn().mockResolvedValue(undefined),
      ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)
    const wrapper = mount(TodayView, { global: { plugins: [pinia] } })

    await wrapper.find('.today-row__done').trigger('click')
    await flushPromises()

    expect(toggleDone).toHaveBeenCalledWith(1)
    const live = wrapper
      .findAll('[aria-live="polite"]')
      .find((n) => n.text().includes('marked done'))
    expect(live?.text()).toContain("'My Task' marked done")
  })

  it('shows an Undo affordance after Done and restores via the store', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const restore = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useTodayStore).mockReturnValue(
      makeStore({ list: [makeTodayTask(7, 0, 'Undo Me')], restore }) as unknown as ReturnType<
        typeof useTodayStore
      >,
    )
    vi.mocked(useBoardsStore).mockReturnValue({
      list: [],
      defaultBoardId: null,
      load: vi.fn().mockResolvedValue(undefined),
      ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)
    const wrapper = mount(TodayView, { global: { plugins: [pinia] } })

    await wrapper.find('.today-row__done').trigger('click')
    await flushPromises()

    const undo = wrapper.find('.today-view__undo-btn')
    expect(undo.exists()).toBe(true)

    await undo.trigger('click')
    await flushPromises()
    expect(restore).toHaveBeenCalledWith(7, localDateString())
  })
})

// ---------------------------------------------------------------------------
// Status mover (move to column)
// ---------------------------------------------------------------------------

describe('TodayView — change status (move to column)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  function mountWithColumns() {
    const pinia = createPinia()
    setActivePinia(pinia)

    const loadToday = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useTodayStore).mockReturnValue(
      makeStore({
        list: [makeTodayTask(1, 0, 'Move Me', { column_id: 100 })],
        loadToday,
      }) as unknown as ReturnType<typeof useTodayStore>,
    )

    // Task lives on a board whose columns are 100 (current) and 101 (target).
    const columns = [
      { id: 100, board_id: 9, name: 'Todo', is_done: false, position: 0, tasks: [] },
      { id: 101, board_id: 9, name: 'Doing', is_done: false, position: 1, tasks: [] },
    ]
    vi.mocked(useBoardsStore).mockReturnValue({
      list: [{ id: 9, name: 'B' }],
      loading: false,
      error: null,
      defaultBoardId: 9,
      load: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      ensureColumns: vi.fn().mockResolvedValue(undefined),
      columnsForColumnId: vi.fn().mockReturnValue(columns),
      invalidateColumns: vi.fn(),
    } as unknown as ReturnType<typeof useBoardsStore>)

    vi.mocked(api.boards.getBoard).mockResolvedValue({
      id: 9,
      name: 'B',
      columns,
    } as any)

    return { wrapper: mount(TodayView, { global: { plugins: [pinia] } }), loadToday }
  }

  it('renders a status trigger and moves the task to the chosen column', async () => {
    vi.mocked(api.tasks.moveTask).mockResolvedValue({} as any)
    const { wrapper, loadToday } = mountWithColumns()
    await flushPromises()

    expect(wrapper.find('.today-row__status-btn').exists()).toBe(true)

    // Dropdown stub renders one button per column; click "Doing" (id 101).
    const items = wrapper.findAll('.dropdown-stub__item')
    const doing = items.find((b) => b.text() === 'Doing')
    expect(doing).toBeTruthy()

    await doing!.trigger('click')
    await flushPromises()

    expect(vi.mocked(api.tasks.moveTask)).toHaveBeenCalledWith({
      task_id: 1,
      column_id: 101,
      position: 0,
    })
    // Reloads after the move (mount + move = 2).
    expect(loadToday).toHaveBeenCalledTimes(2)
  })

  it('disables the current column in the status menu', async () => {
    const { wrapper } = mountWithColumns()
    await flushPromises()

    const items = wrapper.findAll('.dropdown-stub__item')
    const current = items.find((b) => b.text() === 'Todo')
    expect((current!.element as HTMLButtonElement).disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SCN-7 — quick-add from Today auto-commits
// ---------------------------------------------------------------------------

function mountTodayViewWithBoard(tasks: TodayTask[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const loadToday = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useTodayStore).mockReturnValue(
    makeStore({ list: tasks, loadToday }) as unknown as ReturnType<typeof useTodayStore>,
  )

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [{ id: 10, name: 'Main' }],
    loading: false,
    error: null,
    defaultBoardId: 10,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  vi.mocked(api.boards.getBoard).mockResolvedValue({
    id: 10,
    name: 'Main',
    columns: [{ id: 99, name: 'Backlog', position: 0, tasks: [], wip_limit: null }],
  } as any)

  return { wrapper: mount(TodayView, { global: { plugins: [pinia] } }), loadToday }
}

describe('SCN-7: quick-add from Today stamps committed_on = today', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('SCN-7: calls createTask with committed_on equal to today local date string', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    vi.mocked(api.tasks.listToday).mockResolvedValue([])

    const { wrapper } = mountTodayViewWithBoard([])
    await flushPromises()

    const input = wrapper.find('#today-quick-add')
    expect(input.exists()).toBe(true)

    await input.setValue('Write tests')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(api.tasks.createTask)).toHaveBeenCalledOnce()
    expect(vi.mocked(api.tasks.createTask)).toHaveBeenCalledWith(
      expect.objectContaining({ committed_on: localDateString() }),
    )
  })

  it('SCN-7: calls createTask with the submitted title', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    vi.mocked(api.tasks.listToday).mockResolvedValue([])

    const { wrapper } = mountTodayViewWithBoard([])
    await flushPromises()

    await wrapper.find('#today-quick-add').setValue('Stand-up prep')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(api.tasks.createTask)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stand-up prep' }),
    )
  })

  it('SCN-7: refreshes the today list after task creation', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    vi.mocked(api.tasks.listToday).mockResolvedValue([])

    const { wrapper, loadToday } = mountTodayViewWithBoard([])
    await flushPromises()

    await wrapper.find('#today-quick-add').setValue('Morning review')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    // loadToday is called once on mount, then again after create.
    expect(loadToday).toHaveBeenCalledTimes(2)
    expect(loadToday).toHaveBeenLastCalledWith(localDateString())
  })

  it('SCN-7: does not call createTask when title is empty', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)

    const { wrapper } = mountTodayViewWithBoard([])
    await flushPromises()

    await wrapper.find('#today-quick-add').setValue('   ')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(api.tasks.createTask)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SCN-7 (no-column) — disabled control + visible hint when no board exists
// ---------------------------------------------------------------------------

function mountTodayViewNoBoard(tasks: TodayTask[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const loadToday = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useTodayStore).mockReturnValue(
    makeStore({ list: tasks, loadToday }) as unknown as ReturnType<typeof useTodayStore>,
  )

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [],
    loading: false,
    error: null,
    defaultBoardId: null,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  vi.mocked(api.boards.getBoard).mockResolvedValue(undefined as any)

  return { wrapper: mount(TodayView, { global: { plugins: [pinia] } }), loadToday }
}

describe('SCN-7 (no-column): quick-add disabled with hint when no board configured', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the quick-add input disabled with a visible hint', async () => {
    const { wrapper } = mountTodayViewNoBoard([])
    await flushPromises()

    const input = wrapper.find('#today-quick-add')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).disabled).toBe(true)

    const btn = wrapper.find('.today-view__quick-btn')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)

    expect(wrapper.text()).toContain("Create a board first to add today's tasks.")
  })

  it('does not call createTask when no board is configured and submit is attempted', async () => {
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)

    const { wrapper } = mountTodayViewNoBoard([])
    await flushPromises()

    const input = wrapper.find('#today-quick-add')
    await input.setValue('Some task')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(vi.mocked(api.tasks.createTask)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SCN-8 — new row appears in Today list after quick-add success
// ---------------------------------------------------------------------------

function mountTodayViewWithReactiveStore(initialTasks: TodayTask[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const storeObj = reactive({
    list: [...initialTasks] as TodayTask[],
    loading: false,
    error: null as string | null,
    loadToday: vi.fn(),
    uncommit: vi.fn().mockResolvedValue(undefined),
    toggleDone: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  })

  storeObj.loadToday.mockImplementation(async (today: string) => {
    storeObj.list = await api.tasks.listToday(today)
  })

  vi.mocked(useTodayStore).mockReturnValue(storeObj as unknown as ReturnType<typeof useTodayStore>)

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [{ id: 10, name: 'Main' }],
    loading: false,
    error: null,
    defaultBoardId: 10,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ensureColumns: vi.fn().mockResolvedValue(undefined),
    columnsForColumnId: vi.fn().mockReturnValue([]),
    invalidateColumns: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  vi.mocked(api.boards.getBoard).mockResolvedValue({
    id: 10,
    name: 'Main',
    columns: [{ id: 99, name: 'Backlog', position: 0, tasks: [], wip_limit: null }],
  } as any)

  return { wrapper: mount(TodayView, { global: { plugins: [pinia] } }), storeObj }
}

describe('SCN-8: new row appears in Today list after quick-add success', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the new task row and clears the input after successful add', async () => {
    const newTask = makeTodayTask(42, 0, 'Deploy hotfix')
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    vi.mocked(api.tasks.listToday)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newTask])

    const { wrapper } = mountTodayViewWithReactiveStore([])
    await flushPromises()

    const input = wrapper.find('#today-quick-add')
    expect(input.exists()).toBe(true)

    await input.setValue('Deploy hotfix')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    const rows = wrapper.findAll('.today-row__title')
    expect(rows.some((r) => r.text() === 'Deploy hotfix')).toBe(true)

    // The single quick-add input is cleared after a successful add.
    expect((wrapper.find('#today-quick-add').element as HTMLInputElement).value).toBe('')
  })

  it('creates with committed_on matching localDateString()', async () => {
    const newTask = makeTodayTask(55, 0, 'Review PR')
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    vi.mocked(api.tasks.listToday)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newTask])

    const { wrapper } = mountTodayViewWithReactiveStore([])
    await flushPromises()

    await wrapper.find('#today-quick-add').setValue('Review PR')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(api.tasks.createTask)).toHaveBeenCalledWith(
      expect.objectContaining({ committed_on: localDateString() }),
    )
  })
})
