import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Board } from '@tasknote/shared'
import type { CreateBoardDto, UpdateBoardDto } from '@tasknote/shared'

export const useBoardsStore = defineStore('boards', () => {
  const list = ref<Board[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  return { list, loading, error, defaultBoardId, load, create, update, remove }
})
