import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  boards: {
    listBoards: vi.fn(),
    getBoard: vi.fn(),
  },
}))

import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'

function board(id: number, name: string, columns: { id: number; name: string; is_done?: boolean }[]) {
  return {
    id,
    name,
    columns: columns.map((c, i) => ({
      id: c.id,
      board_id: id,
      name: c.name,
      is_done: c.is_done ?? false,
      position: i,
      tasks: [],
    })),
  }
}

describe('useBoardsStore — column cache', () => {
  let store: ReturnType<typeof useBoardsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useBoardsStore()
    vi.resetAllMocks()
  })

  it('ensureColumns fetches each board once and indexes columns by column id', async () => {
    store.list = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ] as never
    vi.mocked(api.boards.getBoard)
      .mockResolvedValueOnce(board(1, 'A', [{ id: 10, name: 'Todo' }, { id: 11, name: 'Done', is_done: true }]) as never)
      .mockResolvedValueOnce(board(2, 'B', [{ id: 20, name: 'Backlog' }]) as never)

    await store.ensureColumns()

    expect(api.boards.getBoard).toHaveBeenCalledTimes(2)
    // Column 10 belongs to board 1 → its siblings are board 1's columns.
    expect(store.columnsForColumnId(10).map((c) => c.id)).toEqual([10, 11])
    // Column 20 belongs to board 2.
    expect(store.columnsForColumnId(20).map((c) => c.id)).toEqual([20])
    // Unknown column → empty.
    expect(store.columnsForColumnId(999)).toEqual([])
  })

  it('ensureColumns is idempotent — a second call does not refetch', async () => {
    store.list = [{ id: 1, name: 'A' }] as never
    vi.mocked(api.boards.getBoard).mockResolvedValue(board(1, 'A', [{ id: 10, name: 'Todo' }]) as never)

    await store.ensureColumns()
    await store.ensureColumns()

    expect(api.boards.getBoard).toHaveBeenCalledTimes(1)
  })

  it('invalidateColumns forces the next ensureColumns to refetch', async () => {
    store.list = [{ id: 1, name: 'A' }] as never
    vi.mocked(api.boards.getBoard).mockResolvedValue(board(1, 'A', [{ id: 10, name: 'Todo' }]) as never)

    await store.ensureColumns()
    store.invalidateColumns()
    expect(store.columnsForColumnId(10)).toEqual([])
    await store.ensureColumns()

    expect(api.boards.getBoard).toHaveBeenCalledTimes(2)
  })
})
