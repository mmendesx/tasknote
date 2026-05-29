import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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

import { flushPromises } from '@vue/test-utils'
import TodayView from '../TodayView.vue'
import { useTodayStore, localDateString } from '@/stores/today'
import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'
import type { TodayTask } from '@/api/tasks'

function makeTodayTask(id: number, carried_days: number, title = `Task ${id}`): TodayTask {
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
    created_at: new Date(),
    updated_at: new Date(),
    carried_days,
  } as TodayTask
}

function mountTodayView(
  tasks: TodayTask[] = [],
  loading = false
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const loadToday = vi.fn().mockResolvedValue(undefined)
  const uncommit = vi.fn().mockResolvedValue(undefined)
  const toggleDone = vi.fn().mockResolvedValue(undefined)

  vi.mocked(useTodayStore).mockReturnValue({
    list: tasks,
    loading,
    error: null,
    loadToday,
    uncommit,
    toggleDone,
  } as unknown as ReturnType<typeof useTodayStore>)

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [],
    loading: false,
    error: null,
    defaultBoardId: null,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  return mount(TodayView, {
    global: {
      plugins: [pinia],
    },
  })
}

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

describe('TodayView — task list rendering', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders a row for each task in the list', () => {
    const tasks = [makeTodayTask(1, 0), makeTodayTask(2, 1)]
    const wrapper = mountTodayView(tasks)

    expect(wrapper.findAll('.today-row')).toHaveLength(2)
  })

  it('renders carried badge when carried_days > 0', () => {
    const tasks = [makeTodayTask(1, 3)]
    const wrapper = mountTodayView(tasks)

    const badge = wrapper.find('.today-row__carried')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('carried 3d')
  })

  it('does not render carried badge when carried_days is 0', () => {
    const tasks = [makeTodayTask(1, 0)]
    const wrapper = mountTodayView(tasks)

    expect(wrapper.find('.today-row__carried').exists()).toBe(false)
  })

  it('renders accessible aria-label on carried badge', () => {
    const tasks = [makeTodayTask(1, 2)]
    const wrapper = mountTodayView(tasks)

    const badge = wrapper.find('.today-row__carried')
    expect(badge.attributes('aria-label')).toBe('Carried 2 days')
  })

  it('preserves carried-first API ordering without re-sorting', () => {
    const tasks = [
      makeTodayTask(3, 5, 'Oldest carried'),
      makeTodayTask(1, 2, 'Mid carried'),
      makeTodayTask(2, 0, 'Today task'),
    ]
    const wrapper = mountTodayView(tasks)

    const rows = wrapper.findAll('.today-row__title')
    expect(rows[0].text()).toBe('Oldest carried')
    expect(rows[1].text()).toBe('Mid carried')
    expect(rows[2].text()).toBe('Today task')
  })

  it('renders list as ul with role=list', () => {
    const tasks = [makeTodayTask(1, 0)]
    const wrapper = mountTodayView(tasks)

    const list = wrapper.find('.today-list')
    expect(list.exists()).toBe(true)
    expect(list.attributes('role')).toBe('list')
  })
})

describe('TodayView — row actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('done button has accessible aria-label', () => {
    const tasks = [makeTodayTask(1, 0, 'My Task')]
    const wrapper = mountTodayView(tasks)

    const doneBtn = wrapper.find('.today-row__done-btn')
    expect(doneBtn.attributes('aria-label')).toContain("Mark 'My Task' as done")
  })

  it('uncommit button has accessible aria-label', () => {
    const tasks = [makeTodayTask(1, 0, 'My Task')]
    const wrapper = mountTodayView(tasks)

    const uncommitBtn = wrapper.find('.today-row__uncommit-btn')
    expect(uncommitBtn.attributes('aria-label')).toContain("Remove 'My Task' from today")
  })
})

// ---------------------------------------------------------------------------
// SCN-7 — quick-add from Today auto-commits
// ---------------------------------------------------------------------------

function mountTodayViewWithBoard(tasks: TodayTask[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const loadToday = vi.fn().mockResolvedValue(undefined)
  const uncommit = vi.fn().mockResolvedValue(undefined)
  const toggleDone = vi.fn().mockResolvedValue(undefined)

  vi.mocked(useTodayStore).mockReturnValue({
    list: tasks,
    loading: false,
    error: null,
    loadToday,
    uncommit,
    toggleDone,
  } as unknown as ReturnType<typeof useTodayStore>)

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [{ id: 10, name: 'Main' }],
    loading: false,
    error: null,
    defaultBoardId: 10,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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
      expect.objectContaining({ committed_on: localDateString() })
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
      expect.objectContaining({ title: 'Stand-up prep' })
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

    // loadToday is called once on mount, then again after create
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

  vi.mocked(useTodayStore).mockReturnValue({
    list: tasks,
    loading: false,
    error: null,
    loadToday,
    uncommit: vi.fn().mockResolvedValue(undefined),
    toggleDone: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useTodayStore>)

  vi.mocked(useBoardsStore).mockReturnValue({
    list: [],
    loading: false,
    error: null,
    defaultBoardId: null,
    load: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as ReturnType<typeof useBoardsStore>)

  // No board resolves — getBoard won't be called
  vi.mocked(api.boards.getBoard).mockResolvedValue(undefined as any)

  return { wrapper: mount(TodayView, { global: { plugins: [pinia] } }), loadToday }
}

describe('SCN-7 (no-column): quick-add disabled with hint when no board configured', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the quick-add input disabled with a visible hint in empty state', async () => {
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

    // Directly invoke submitQuickAdd by setting value and calling the exposed method
    // The button is disabled, but we test the guard in submitQuickAdd via keydown
    const input = wrapper.find('#today-quick-add')
    await input.setValue('Some task')
    // Simulate Enter keydown to exercise the code path through handleQuickAddKeydown
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

  const { reactive } = require('vue')

  const storeObj = reactive({
    list: [...initialTasks] as TodayTask[],
    loading: false,
    error: null as string | null,
    loadToday: vi.fn(),
    uncommit: vi.fn().mockResolvedValue(undefined),
    toggleDone: vi.fn().mockResolvedValue(undefined),
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
  } as unknown as ReturnType<typeof useBoardsStore>)

  vi.mocked(api.boards.getBoard).mockResolvedValue({
    id: 10,
    name: 'Main',
    columns: [{ id: 99, name: 'Backlog', position: 0, tasks: [], wip_limit: null }],
  } as any)

  return {
    wrapper: mount(TodayView, { global: { plugins: [pinia] } }),
    storeObj,
  }
}

describe('SCN-8: new row appears in Today list after quick-add success', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the new task row and clears the input after successful add', async () => {
    const newTask = makeTodayTask(42, 0, 'Deploy hotfix')
    vi.mocked(api.tasks.createTask).mockResolvedValue({} as any)
    // First call (mount): empty list. Second call (after create): contains new task.
    vi.mocked(api.tasks.listToday)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newTask])

    const { wrapper } = mountTodayViewWithReactiveStore([])
    await flushPromises()

    // Empty state — use the empty-state input
    const input = wrapper.find('#today-quick-add')
    expect(input.exists()).toBe(true)

    await input.setValue('Deploy hotfix')
    await wrapper.find('.today-view__quick-btn').trigger('click')
    await flushPromises()

    // Task row should now be visible
    const rows = wrapper.findAll('.today-row__title')
    expect(rows.some((r) => r.text() === 'Deploy hotfix')).toBe(true)

    // Input in the populated state (bottom bar) should be cleared
    const bottomInput = wrapper.find('#today-bottom-add')
    expect((bottomInput.element as HTMLInputElement).value).toBe('')
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
      expect.objectContaining({ committed_on: localDateString() })
    )
  })
})
