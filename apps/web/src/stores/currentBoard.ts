import { ref, computed, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { useToast } from '@tasknote/ui'
import * as api from '@/api'
import type { BoardWithColumns, Task, ColumnWithTasks } from '@tasknote/shared'
import type { CreateTaskDto, UpdateTaskDto } from '@tasknote/shared'

const TEMP_ID_OFFSET = -1_000_000

function nextTempId(): number {
  return TEMP_ID_OFFSET - Date.now()
}

function snapshot(board: BoardWithColumns): BoardWithColumns {
  return structuredClone(toRaw(board))
}

export const useCurrentBoardStore = defineStore('currentBoard', () => {
  const toast = useToast()

  const board = ref<BoardWithColumns | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const tagFilter = ref<number[]>([])

  const visibleTasks = computed<ColumnWithTasks[]>(() => {
    if (!board.value) return []
    if (tagFilter.value.length === 0) return board.value.columns

    return board.value.columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) =>
        tagFilter.value.every((tagId) =>
          (t as Task & { tag_ids?: number[] }).tag_ids?.includes(tagId)
        )
      ),
    }))
  })

  async function load(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      board.value = await api.boards.getBoard(id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load board'
    } finally {
      loading.value = false
    }
  }

  async function optimistic<T>(
    mutate: () => void,
    apiCall: () => Promise<T>,
    errorMessage: string
  ): Promise<T | undefined> {
    if (!board.value) return undefined

    const snap = snapshot(board.value)
    mutate()

    try {
      return await apiCall()
    } catch (err) {
      board.value = snap
      const msg = err instanceof Error ? err.message : errorMessage
      toast.error(errorMessage, msg)
      throw err
    }
  }

  async function moveTask(
    taskId: number,
    toColumnId: number,
    toPosition: number
  ): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        
        let movingTask: Task | undefined
        for (const col of board.value.columns) {
          const idx = col.tasks.findIndex((t) => t.id === taskId)
          if (idx !== -1) {
            ;[movingTask] = col.tasks.splice(idx, 1)
            break
          }
        }
        if (!movingTask) return

        const targetCol = board.value.columns.find((c) => c.id === toColumnId)
        if (targetCol) {
          movingTask.column_id = toColumnId
          movingTask.position = toPosition
          targetCol.tasks.splice(toPosition, 0, movingTask)
        }
      },
      () => api.tasks.moveTask({ task_id: taskId, column_id: toColumnId, position: toPosition }),
      'Failed to move task'
    )
  }

  async function reorderColumns(columnIds: number[]): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        const colMap = new Map(board.value.columns.map((c) => [c.id, c]))
        board.value.columns = columnIds
          .map((id, index) => {
            const col = colMap.get(id)
            if (col) col.position = index
            return col
          })
          .filter((c): c is ColumnWithTasks => c !== undefined)
      },
      () =>
        api.columns.reorderColumns({
          board_id: board.value!.id,
          column_ids: columnIds,
        }),
      'Failed to reorder columns'
    )
  }

  async function createTask(columnId: number, dto: CreateTaskDto): Promise<Task | undefined> {
    if (!board.value) return undefined

    const tempId = nextTempId()
    const tempTask: Task = {
      id: tempId,
      column_id: columnId,
      title: dto.title,
      description_md: dto.description_md ?? null,
      priority: dto.priority ?? 'medium',
      due_date: null,
      position: 0,
      archived_at: null,
      completed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    }

    const col = board.value.columns.find((c) => c.id === columnId)
    if (!col) return undefined

    const snap = snapshot(board.value)
    
    col.tasks.unshift(tempTask)

    try {
      const realTask = await api.tasks.createTask(dto)
      
      const idx = col.tasks.findIndex((t) => t.id === tempId)
      if (idx !== -1) col.tasks.splice(idx, 1, realTask)
      return realTask
    } catch (err) {
      board.value = snap
      const msg = err instanceof Error ? err.message : 'Failed to create task'
      toast.error('Failed to create task', msg)
      throw err
    }
  }

  async function updateTask(taskId: number, dto: UpdateTaskDto): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        for (const col of board.value.columns) {
          const task = col.tasks.find((t) => t.id === taskId)
          if (task) {
            Object.assign(task, dto)
            break
          }
        }
      },
      () => api.tasks.updateTask(taskId, dto),
      'Failed to update task'
    )
  }

  async function softDeleteTask(taskId: number): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        for (const col of board.value.columns) {
          const idx = col.tasks.findIndex((t) => t.id === taskId)
          if (idx !== -1) {
            col.tasks.splice(idx, 1)
            break
          }
        }
      },
      () => api.tasks.deleteTask(taskId),
      'Failed to archive task'
    )
  }

  async function addTag(taskId: number, tagId: number): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        for (const col of board.value.columns) {
          const task = col.tasks.find((t) => t.id === taskId) as
            | (Task & { tag_ids?: number[] })
            | undefined
          if (task) {
            task.tag_ids = [...(task.tag_ids ?? []), tagId]
            break
          }
        }
      },
      () => api.tags.addTagToTask(taskId, tagId),
      'Failed to add tag'
    )
  }

  async function removeTag(taskId: number, tagId: number): Promise<void> {
    if (!board.value) return

    await optimistic(
      () => {
        if (!board.value) return
        for (const col of board.value.columns) {
          const task = col.tasks.find((t) => t.id === taskId) as
            | (Task & { tag_ids?: number[] })
            | undefined
          if (task) {
            task.tag_ids = (task.tag_ids ?? []).filter((id) => id !== tagId)
            break
          }
        }
      },
      () => api.tags.removeTagFromTask(taskId, tagId),
      'Failed to remove tag'
    )
  }

  function setTagFilter(tagIds: number[]): void {
    tagFilter.value = tagIds
  }

  return {
    board,
    loading,
    error,
    tagFilter,
    visibleTasks,
    load,
    moveTask,
    reorderColumns,
    createTask,
    updateTask,
    softDeleteTask,
    addTag,
    removeTag,
    setTagFilter,
  }
})
