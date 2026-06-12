<script setup lang="ts">

import { ref, computed, watch, nextTick } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Input } from '@tasknote/ui'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { IconLink, IconUnlink } from './icons'
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
const activeIndex = ref(-1)
const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<InstanceType<typeof Input> | null>(null)

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

const hasLinkedTask = computed<boolean>(() => props.linkedTaskId !== null)

function openPicker(): void {
  query.value = ''
  activeIndex.value = -1
  isOpen.value = true
  nextTick(() => {
    // Focus the search input after the dropdown renders
    const el = searchInputRef.value?.$el as HTMLElement | undefined
    const inputEl = el?.tagName === 'INPUT' ? (el as HTMLInputElement) : el?.querySelector<HTMLInputElement>('input')
    inputEl?.focus()
  })
}

function closePicker(): void {
  isOpen.value = false
  activeIndex.value = -1
}

function pickTask(task: Task): void {
  emit('select', task.id)
  isOpen.value = false
  activeIndex.value = -1
}

function unlink(): void {
  emit('select', null)
  isOpen.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closePicker()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredTasks.value.length - 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, -1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const task = filteredTasks.value[activeIndex.value]
    if (task) {
      pickTask(task)
    }
    return
  }
}

// Reset active index when search query changes
watch(query, () => {
  activeIndex.value = -1
})

onClickOutside(rootRef, () => {
  closePicker()
})

function optionId(index: number): string {
  return `task-option-${index}`
}
</script>

<template>
  <div
    ref="rootRef"
    class="task-link-picker"
    @keydown="handleKeydown"
  >
    <!-- Linked state: shown when linkedTaskId is set (even if task not in store) -->
    <div v-if="hasLinkedTask" class="task-link-picker__chip task-link-picker__chip--linked">
      <IconLink class="task-link-picker__chip-icon" width="14" height="14" />
      <span class="task-link-picker__task-name">{{ linkedTask ? linkedTask.title : 'Linked task' }}</span>
      <button
        type="button"
        class="task-link-picker__unlink-btn"
        aria-label="Unlink task"
        @click="unlink"
      >
        <IconUnlink width="14" height="14" />
      </button>
    </div>

    <!-- Unlinked state -->
    <button
      v-else
      type="button"
      class="task-link-picker__chip task-link-picker__chip--unlinked"
      :aria-haspopup="'listbox'"
      :aria-expanded="isOpen"
      @click="openPicker"
    >
      <IconLink class="task-link-picker__chip-icon" width="14" height="14" />
      <span>Link to task…</span>
    </button>

    <!-- Dropdown -->
    <div
      v-if="isOpen"
      class="task-link-picker__dropdown diagram-floating-chrome"
    >
      <!-- Combobox input: owns activedescendant and controls the listbox -->
      <Input
        ref="searchInputRef"
        v-model="query"
        role="combobox"
        :aria-expanded="isOpen"
        aria-controls="task-link-picker-listbox"
        :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
        aria-autocomplete="list"
        placeholder="Search tasks…"
        size="sm"
        autofocus
        class="task-link-picker__input"
      />
      <!-- Listbox: contains only role="option" children -->
      <ul
        id="task-link-picker-listbox"
        role="listbox"
        aria-label="Tasks"
        class="task-link-picker__list"
      >
        <li
          v-for="(task, index) in filteredTasks"
          :id="optionId(index)"
          :key="task.id"
          role="option"
          :aria-selected="index === activeIndex"
          :class="[
            'task-link-picker__item',
            { 'task-link-picker__item--active': index === activeIndex }
          ]"
          @mousedown.prevent="pickTask(task)"
          @mousemove="activeIndex = index"
        >
          {{ task.title }}
        </li>
      </ul>
      <!-- Empty message: plain element, not role="option" -->
      <p v-if="!filteredTasks.length" class="task-link-picker__empty" aria-live="polite">
        No tasks found
      </p>
    </div>
  </div>
</template>

<style>
@import '../../styles/floating-chrome.css';
</style>

<style scoped>
.task-link-picker {
  position: relative;
  font-size: 0.8125rem;
}

/* ── Chip base ─────────────────────────────────────────────── */

.task-link-picker__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 0.25rem);
  padding: 0.3125rem 0.625rem;
  border-radius: var(--radius-control);
  font-size: 0.8125rem;
  max-width: 100%;
  min-width: 0;
  cursor: pointer;
  transition:
    border-color var(--motion-duration-fast),
    background var(--motion-duration-fast);
}

/* ── Unlinked chip ─────────────────────────────────────────── */

.task-link-picker__chip--unlinked {
  color: var(--color-text-muted);
  background: transparent;
  border: 1px dashed var(--color-border);
  width: 100%;
  text-align: left;
}

.task-link-picker__chip--unlinked:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text-primary);
}

/* ── Linked chip ───────────────────────────────────────────── */

.task-link-picker__chip--linked {
  color: var(--color-text-primary);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  width: 100%;
}

.task-link-picker__chip-icon {
  flex-shrink: 0;
  color: var(--color-accent);
}

.task-link-picker__task-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Unlink button — hidden by default, revealed on chip hover */
.task-link-picker__unlink-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--motion-duration-fast),
    color var(--motion-duration-fast),
    background var(--motion-duration-fast);
}

.task-link-picker__chip--linked:hover .task-link-picker__unlink-btn {
  opacity: 1;
}

.task-link-picker__unlink-btn:hover {
  color: var(--color-status-blocked, #ef4444);
  background: color-mix(in srgb, var(--color-status-blocked, #ef4444) 10%, transparent);
}

/* ── Dropdown ──────────────────────────────────────────────── */

.task-link-picker__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
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
  padding: var(--space-1, 0.25rem) 0;
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

.task-link-picker__item:hover,
.task-link-picker__item--active {
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-elevated));
}

.task-link-picker__empty {
  padding: 0.5rem 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .task-link-picker__chip,
  .task-link-picker__unlink-btn,
  .task-link-picker__item {
    transition: none;
  }
}
</style>
