<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Button, useToast } from '@tasknote/ui'
import * as api from '@/api'
import type { Task } from '@tasknote/shared'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'

interface ArchivedTask extends Task {
  column?: {
    id: number
    name: string
  }
}

const props = defineProps<{
  boardId: number | null
}>()

const toast = useToast()

const tasks = ref<ArchivedTask[]>([])
const isLoading = ref(false)
const confirmOpen = ref(false)
const selectedTask = ref<ArchivedTask | null>(null)
const restoringId = ref<number | null>(null)
const deletingId = ref<number | null>(null)

async function loadTasks() {
  isLoading.value = true
  try {
    tasks.value = (await api.tasks.listArchivedTasks(
      props.boardId ?? undefined
    )) as ArchivedTask[]
  } catch {
    toast.error('Failed to load archived tasks', 'Please try again.')
  } finally {
    isLoading.value = false
  }
}

onMounted(loadTasks)
watch(() => props.boardId, loadTasks)

async function restore(task: ArchivedTask) {
  restoringId.value = task.id
  try {
    await api.tasks.restoreTask(task.id)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    toast.success('Task restored', `"${task.title}" is back on the board.`)
  } catch {
    toast.error('Failed to restore task', 'Please try again.')
  } finally {
    restoringId.value = null
  }
}

function openDeleteConfirm(task: ArchivedTask) {
  selectedTask.value = task
  confirmOpen.value = true
}

async function permanentDelete() {
  if (!selectedTask.value) return
  deletingId.value = selectedTask.value.id
  const task = selectedTask.value
  try {
    await api.tasks.permanentDeleteTask(task.id)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    toast.success('Task deleted', `"${task.title}" has been permanently removed.`)
  } catch {
    toast.error('Failed to delete task', 'Please try again.')
  } finally {
    deletingId.value = null
    selectedTask.value = null
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div>
    
    <div v-if="isLoading" class="space-y-2" aria-live="polite" aria-busy="true">
      <div
        v-for="i in 3"
        :key="i"
        class="h-16 rounded-control bg-surface animate-pulse"
        aria-hidden="true"
      />
    </div>

    <div
      v-else-if="tasks.length === 0"
      class="py-16 text-center text-text-muted text-sm"
    >
      No archived tasks{{ boardId ? ' for this board' : '' }}.
    </div>

    <ul v-else class="space-y-2" role="list">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3"
      >
        
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-text-primary">{{ task.title }}</p>
          <p class="mt-0.5 text-xs text-text-muted">
            <span v-if="task.column">{{ task.column.name }} &middot; </span>
            Archived {{ formatDate(task.archived_at) }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            :loading="restoringId === task.id"
            :disabled="deletingId === task.id"
            @click="restore(task)"
          >
            Restore
          </Button>
          <Button
            variant="danger"
            size="sm"
            :loading="deletingId === task.id"
            :disabled="restoringId === task.id"
            @click="openDeleteConfirm(task)"
          >
            Delete permanently
          </Button>
        </div>
      </li>
    </ul>

    <ConfirmDeleteDialog
      v-model:open="confirmOpen"
      :item-name="selectedTask?.title ?? ''"
      @confirm="permanentDelete"
    />
  </div>
</template>
