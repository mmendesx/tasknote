<script setup lang="ts">
import { computed } from 'vue'
import { localDateString } from '@/stores/today'
import {
  formatDueDate,
  getPriorityMeta,
  formatCarried,
  carriedAriaLabel,
} from './task-presentation'
import { IconCheck, IconMinus } from './icons'
import type { TodayTask } from '@/api/tasks'

const props = defineProps<{
  task: TodayTask
  completing?: boolean
}>()

const emit = defineEmits<{
  open: [id: number]
  done: [id: number, title: string]
  remove: [id: number, title: string]
}>()

const today = localDateString()
const due = computed(() => formatDueDate(props.task.due_date, today))
const priority = computed(() => getPriorityMeta(props.task.priority))
</script>

<template>
  <li class="today-row">
    <button
      type="button"
      class="today-row__body"
      :aria-label="`Open task: ${task.title}`"
      @click="emit('open', task.id)"
    >
      <span class="today-row__title">{{ task.title }}</span>
      <span class="today-row__meta">
        <span
          v-if="task.carried_days > 0"
          class="today-row__carried"
          :aria-label="carriedAriaLabel(task.carried_days)"
        >
          {{ formatCarried(task.carried_days) }}
        </span>
        <span
          v-if="due"
          class="today-row__due"
          :data-overdue="due.overdue ? 'true' : undefined"
        >
          {{ due.label }}
        </span>
        <span
          class="today-row__priority"
          :data-priority="task.priority"
          :style="{ color: priority.color, borderColor: priority.color + '55' }"
        >
          {{ priority.label }}
        </span>
      </span>
    </button>

    <button
      type="button"
      class="today-row__done"
      :aria-label="`Mark '${task.title}' as done`"
      :disabled="completing"
      @click="emit('done', task.id, task.title)"
    >
      <IconCheck width="14" height="14" aria-hidden="true" />
      {{ completing ? 'Done…' : 'Done' }}
    </button>

    <button
      type="button"
      class="today-row__uncommit-btn"
      :aria-label="`Remove '${task.title}' from today`"
      title="Remove from today"
      @click="emit('remove', task.id, task.title)"
    >
      <IconMinus width="14" height="14" aria-hidden="true" />
    </button>
  </li>
</template>

<style scoped>
.today-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  transition:
    border-color var(--motion-duration-fast) var(--motion-easing),
    background-color var(--motion-duration-fast) var(--motion-easing);
}

.today-row:hover {
  border-color: var(--color-text-muted);
  background: var(--color-surface-elevated);
}

.today-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  color: inherit;
  font: inherit;
}

.today-row__title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  word-break: break-word;
  line-height: var(--leading-body);
}

.today-row__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.today-row__carried {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-status-doing);
  background: color-mix(in srgb, var(--color-status-doing) 12%, transparent);
  border-radius: 999px;
  padding: 1px 7px;
}

.today-row__due {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.today-row__due[data-overdue='true'] {
  color: var(--color-status-blocked);
  font-weight: 600;
}

.today-row__priority {
  font-size: var(--text-xs);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid;
  background-color: transparent;
  flex-shrink: 0;
}

.today-row__done {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-status-done);
  background: transparent;
  border: 1px solid var(--color-status-done);
  cursor: pointer;
  transition:
    color var(--motion-duration-fast),
    background-color var(--motion-duration-fast),
    border-color var(--motion-duration-fast),
    opacity var(--motion-duration-fast);
}

.today-row__done:hover {
  color: var(--color-bg);
  background: var(--color-status-done);
}

.today-row__done:disabled {
  opacity: 0.55;
  cursor: default;
}

.today-row__uncommit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--motion-duration-fast),
    color var(--motion-duration-fast);
}

.today-row:hover .today-row__uncommit-btn,
.today-row:focus-within .today-row__uncommit-btn {
  opacity: 1;
  pointer-events: auto;
}

.today-row__uncommit-btn:hover {
  color: var(--color-text-primary);
}

@media (hover: none) {
  .today-row__uncommit-btn {
    opacity: 0.4;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .today-row,
  .today-row__done,
  .today-row__uncommit-btn {
    transition: none;
  }
}
</style>
