import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Board, ColumnWithTasks } from '@tasknote/shared'
import type { CreateBoardDto, UpdateBoardDto } from '@tasknote/shared'

export const useBoardsStore = defineStore('boards', () => {
  const list = ref<Board[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Lazy cache of every board's columns, indexed by board id, plus a reverse
  // column-id → board-id index. Powers cross-board lookups (e.g. the Today
  // page's "move to column" control, where a task may live on any board).
  // ponytail: fetches each board once; if board count ever grows large,
  // add board_id to the task payload and drop this fan-out.
  const columnsByBoard = ref<Record<number, ColumnWithTasks[]>>({})
  const columnToBoard = ref<Record<number, number>>({})
  let columnsLoaded = false
  let columnsPromise: Promise<void> | null = null

  /** Load (once) all boards' columns into the cache. Idempotent + deduped. */
  async function ensureColumns(): Promise<void> {
    if (columnsLoaded) return
    if (columnsPromise) return columnsPromise
    columnsPromise = (async () => {
      if (list.value.length === 0) await load()
      const results = await Promise.all(
        list.value.map((b) => api.boards.getBoard(b.id).catch(() => null)),
      )
      const byBoard: Record<number, ColumnWithTasks[]> = {}
      const toBoard: Record<number, number> = {}
      for (const board of results) {
        if (!board) continue
        byBoard[board.id] = board.columns
        for (const col of board.columns) toBoard[col.id] = board.id
      }
      columnsByBoard.value = byBoard
      columnToBoard.value = toBoard
      columnsLoaded = true
    })()
    try {
      await columnsPromise
    } finally {
      columnsPromise = null
    }
  }

  /** Sibling columns of the board that owns `columnId` (empty if unknown). */
  function columnsForColumnId(columnId: number): ColumnWithTasks[] {
    const boardId = columnToBoard.value[columnId]
    return boardId != null ? (columnsByBoard.value[boardId] ?? []) : []
  }

  /** Drop the column cache so the next ensureColumns refetches (after moves). */
  function invalidateColumns(): void {
    columnsLoaded = false
    columnsByBoard.value = {}
    columnToBoard.value = {}
  }

  const defaultBoardId = computed<number | null>(() => {
    if (!list.value?.length) return null
    const sorted = [...list.value].sort((a, b) => a.position - b.position)
    return sorted[0]?.id ?? null
  })

  // Abort the previous in-flight load when a new one starts: a superseded
  // response must neither write state nor clobber the newer call's flags.
  let loadAbort: AbortController | null = null

  async function load(): Promise<void> {
    loadAbort?.abort()
    const ctrl = new AbortController()
    loadAbort = ctrl
    loading.value = true
    error.value = null
    try {
      list.value = await api.boards.listBoards(ctrl.signal)
    } catch (err) {
      if (ctrl.signal.aborted) return
      error.value = err instanceof Error ? err.message : 'Failed to load boards'
    } finally {
      if (loadAbort === ctrl) {
        loading.value = false
        loadAbort = null
      }
    }
  }

  async function create(dto: CreateBoardDto): Promise<Board> {
    loading.value = true
    error.value = null
    try {
      const board = await api.boards.createBoard(dto)
      list.value.push(board)
      return board
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create board'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function update(id: number, dto: UpdateBoardDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const updated = await api.boards.updateBoard(id, dto)
      const index = list.value.findIndex((b) => b.id === id)
      if (index !== -1) list.value[index] = updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update board'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await api.boards.deleteBoard(id)
      list.value = list.value.filter((b) => b.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete board'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    list,
    loading,
    error,
    defaultBoardId,
    load,
    create,
    update,
    remove,
    columnsByBoard,
    ensureColumns,
    columnsForColumnId,
    invalidateColumns,
  }
})
