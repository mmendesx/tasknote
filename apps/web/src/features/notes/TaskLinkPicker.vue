<script setup lang="ts">

import { ref, computed } from 'vue'
import { Input } from '@tasknote/ui'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import type { Task } from '@tasknote/shared'

const props = defineProps<{
  linkedTaskId: number | null
}>()

const emit = defineEmits<{
  select: [taskId: number | null]
}>()

const boardStore = useCurrentBoardStore()
const query = ref('')
const isOpen = ref(false)

const allTasks = computed<Task[]>(() =>
  boardStore.board?.columns.flatMap((c) => c.tasks) ?? []
)

const filteredTasks = computed<Task[]>(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return allTasks.value.slice(0, 20)
  return allTasks.value
    .filter((t) => t.title.toLowerCase().includes(q))
    .slice(0, 20)
})

const linkedTask = computed<Task | null>(
  () => allTasks.value.find((t) => t.id === props.linkedTaskId) ?? null
)

function openPicker(): void {
  query.value = ''
  isOpen.value = true
}

function pickTask(task: Task): void {
  emit('select', task.id)
  isOpen.value = false
}

function unlink(): void {
  emit('select', null)
  isOpen.value = false
}

function handleBlur(): void {
  
  setTimeout(() => { isOpen.value = false }, 150)
}
</script>

<template>
  <div class="task-link-picker">
    <div v-if="linkedTask" class="task-link-picker__linked">
      <span class="task-link-picker__label">Linked task:</span>
      <span class="task-link-picker__task-name">{{ linkedTask.title }}</span>
      <button
        type="button"
        class="task-link-picker__unlink"
        aria-label="Unlink task"
        @click="unlink"
      >
        Unlink
      </button>
    </div>

    <div v-else class="task-link-picker__trigger-wrap">
      <button
        v-if="!isOpen"
        type="button"
        class="task-link-picker__trigger"
        @click="openPicker"
      >
        Link to task…
      </button>
    </div>

    <div v-if="isOpen" class="task-link-picker__dropdown">
      <Input
        v-model="query"
        placeholder="Search tasks…"
        size="sm"
        autofocus
        class="task-link-picker__input"
        @blur="handleBlur"
      />
      <ul class="task-link-picker__list" role="listbox" aria-label="Tasks">
        <li v-if="!filteredTasks.length" class="task-link-picker__empty">
          No tasks found
        </li>
        <li
          v-for="task in filteredTasks"
          :key="task.id"
          role="option"
          class="task-link-picker__item"
          @mousedown.prevent="pickTask(task)"
        >
          {{ task.title }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.task-link-picker {
  position: relative;
  font-size: 0.8125rem;
}

.task-link-picker__linked {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}

.task-link-picker__label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.task-link-picker__task-name {
  flex: 1;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-link-picker__unlink {
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  color: var(--color-status-blocked);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-control);
  transition: background var(--motion-duration-fast);
}

.task-link-picker__unlink:hover {
  background: color-mix(in srgb, var(--color-status-blocked) 10%, transparent);
}

.task-link-picker__trigger {
  font-size: 0.8125rem;
  color: var(--color-accent);
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-control);
  padding: 0.3125rem 0.625rem;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: border-color var(--motion-duration-fast);
}

.task-link-picker__trigger:hover {
  border-color: var(--color-accent);
}

.task-link-picker__dropdown {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-elevated);
  overflow: hidden;
}

.task-link-picker__input {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.task-link-picker__list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  max-height: 12rem;
  overflow-y: auto;
}

.task-link-picker__item {
  padding: 0.4375rem 0.75rem;
  cursor: pointer;
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background var(--motion-duration-fast);
}

.task-link-picker__item:hover {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.task-link-picker__empty {
  padding: 0.5rem 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>
