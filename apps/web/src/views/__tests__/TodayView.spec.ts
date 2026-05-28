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

import TodayView from '../TodayView.vue'
import { useTodayStore } from '@/stores/today'
import { useBoardsStore } from '@/stores/boards'
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
