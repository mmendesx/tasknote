import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { watch } from 'vue'

vi.mock('@/api', () => ({
  tasks: {
    listToday: vi.fn(),
    commitTask: vi.fn(),
    uncommitTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  boards: {
    listBoards: vi.fn(),
    getBoard: vi.fn(),
  },
}))

import { useTodayStore } from '@/stores/today'
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

describe('useTodayStore — loadToday', () => {
  let store: ReturnType<typeof useTodayStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTodayStore()
    vi.resetAllMocks()
  })

  it('assigns list in a single reassignment after successful fetch', async () => {
    const tasks = [makeTodayTask(1, 2), makeTodayTask(2, 0)]
    vi.mocked(api.tasks.listToday).mockResolvedValueOnce(tasks)

    let reassignments = 0
    watch(() => store.list, () => { reassignments++ }, { flush: 'sync' })

    await store.loadToday('2026-05-28')

    expect(store.list).toHaveLength(2)
    expect(store.list[0].id).toBe(1)
    expect(store.list[1].id).toBe(2)
    // Single list assignment
    expect(reassignments).toBe(1)
  })

  it('preserves carried-first API ordering (does not re-sort)', async () => {
    const tasks = [makeTodayTask(3, 5), makeTodayTask(1, 2), makeTodayTask(2, 0)]
    vi.mocked(api.tasks.listToday).mockResolvedValueOnce(tasks)

    await store.loadToday('2026-05-28')

    expect(store.list.map((t) => t.id)).toEqual([3, 1, 2])
  })

  it('sets loading false and clears error on success', async () => {
    vi.mocked(api.tasks.listToday).mockResolvedValueOnce([])

    await store.loadToday('2026-05-28')

    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error on failure and leaves list unchanged', async () => {
    store.list = [makeTodayTask(1, 0)]
    vi.mocked(api.tasks.listToday).mockRejectedValueOnce(new Error('Network error'))

    await store.loadToday('2026-05-28')

    expect(store.error).toBe('Network error')
    // List is unchanged (still has previous value; the assign failed)
    expect(store.list).toHaveLength(1)
  })
})

describe('useTodayStore — commit', () => {
  let store: ReturnType<typeof useTodayStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTodayStore()
    vi.resetAllMocks()
  })

  it('calls api.tasks.commitTask with the correct id and today', async () => {
    vi.mocked(api.tasks.commitTask).mockResolvedValueOnce({} as never)
    vi.mocked(api.tasks.listToday).mockResolvedValueOnce([])

    await store.commit(42, '2026-05-28')

    expect(api.tasks.commitTask).toHaveBeenCalledWith(42, '2026-05-28')
  })

  it('reloads the today list after committing', async () => {
    vi.mocked(api.tasks.commitTask).mockResolvedValueOnce({} as never)
    const refreshed = [makeTodayTask(42, 0)]
    vi.mocked(api.tasks.listToday).mockResolvedValueOnce(refreshed)

    await store.commit(42, '2026-05-28')

    expect(api.tasks.listToday).toHaveBeenCalledWith('2026-05-28')
    expect(store.list).toHaveLength(1)
    expect(store.list[0].id).toBe(42)
  })
})

describe('useTodayStore — uncommit', () => {
  let store: ReturnType<typeof useTodayStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTodayStore()
    vi.resetAllMocks()
  })

  it('removes the uncommitted task from list with a single list reassignment', async () => {
    store.list = [makeTodayTask(1, 0), makeTodayTask(2, 1), makeTodayTask(3, 2)]
    vi.mocked(api.tasks.uncommitTask).mockResolvedValueOnce({} as never)

    let reassignments = 0
    watch(() => store.list, () => { reassignments++ }, { flush: 'sync' })

    await store.uncommit(2)

    expect(store.list.map((t) => t.id)).toEqual([1, 3])
    expect(reassignments).toBe(1)
  })

  it('calls api.tasks.uncommitTask with the correct id', async () => {
    store.list = [makeTodayTask(5, 0)]
    vi.mocked(api.tasks.uncommitTask).mockResolvedValueOnce({} as never)

    await store.uncommit(5)

    expect(api.tasks.uncommitTask).toHaveBeenCalledWith(5)
  })
})

describe('useTodayStore — toggleDone', () => {
  let store: ReturnType<typeof useTodayStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTodayStore()
    vi.resetAllMocks()
  })

  it('removes the completed task from list with a single list reassignment', async () => {
    store.list = [makeTodayTask(10, 0), makeTodayTask(11, 1)]
    vi.mocked(api.tasks.deleteTask).mockResolvedValueOnce(undefined)

    let reassignments = 0
    watch(() => store.list, () => { reassignments++ }, { flush: 'sync' })

    await store.toggleDone(10)

    expect(store.list.map((t) => t.id)).toEqual([11])
    expect(reassignments).toBe(1)
  })

  it('calls api.tasks.deleteTask with the correct id', async () => {
    store.list = [makeTodayTask(7, 0)]
    vi.mocked(api.tasks.deleteTask).mockResolvedValueOnce(undefined)

    await store.toggleDone(7)

    expect(api.tasks.deleteTask).toHaveBeenCalledWith(7)
  })
})

describe('useTodayStore — isolation from boards store', () => {
  it('does not mutate the boards store when loadToday is called', async () => {
    setActivePinia(createPinia())
    vi.resetAllMocks()

    vi.mocked(api.tasks.listToday).mockResolvedValueOnce([makeTodayTask(1, 0)])

    // Import boards store after pinia is active
    const { useBoardsStore } = await import('@/stores/boards')
    const boardsStore = useBoardsStore()
    const boardsListBefore = boardsStore.list

    const todayStore = useTodayStore()
    await todayStore.loadToday('2026-05-28')

    // boards store list must be the exact same reference — not touched
    expect(boardsStore.list).toBe(boardsListBefore)
  })
})
