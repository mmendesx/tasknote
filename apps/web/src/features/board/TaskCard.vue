<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@tasknote/shared'
import { useIsDesktop } from '@/composables/useIsDesktop'
import { useAnime } from '@/composables/useAnime'

const props = defineProps<{
  task: Task
  tagColors?: Record<number, string>
}>()

const emit = defineEmits<{
  open: [taskId: number]
}>()

const isDesktop = useIsDesktop()
const { animate, prefersReducedMotion } = useAnime()

// Priority badge colors mapped to design tokens
const priorityConfig: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'var(--color-status-todo)' },
  medium: { label: 'Medium', color: 'var(--color-status-doing)' },
  high:   { label: 'High',   color: 'var(--color-status-blocked)' },
  urgent: { label: 'Urgent', color: 'var(--color-accent)' },
}

const priority = computed(() => priorityConfig[props.task.priority] ?? priorityConfig.medium)

// Due date display
const dueDateLabel = computed(() => {
  if (!props.task.due_date) return null
  const d = new Date(props.task.due_date)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: 'Overdue', overdue: true }
  if (diffDays === 0) return { text: 'Today', overdue: false }
  if (diffDays === 1) return { text: 'Tomorrow', overdue: false }
  return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), overdue: false }
})

// First 3 tag color dots
const tagDots = computed(() => {
  const ids = props.task.tag_ids?.slice(0, 3) ?? []
  return ids.map((id) => props.tagColors?.[id] ?? 'var(--color-text-muted)')
})

function onDragStart(evt: DragEvent) {
  if (!evt.target || prefersReducedMotion.value) return
  animate(evt.target as HTMLElement, {
    scale: 1.03,
    duration: 120,
    easing: 'easeOutQuad',
  })
}

function onDragEnd(evt: DragEvent) {
  if (!evt.target || prefersReducedMotion.value) return
  animate(evt.target as HTMLElement, {
    scale: 1,
    duration: 100,
    easing: 'easeOutQuad',
  })
}

function handleClick() {
  emit('open', props.task.id)
}
</script>

<template>
  <!-- role="article" per ICT-26 spec. The element remains keyboard-operable via
       tabindex + keydown handlers. Long-term, role="button" with aria-label is
       preferred for AT announcement of the interactive pattern. -->
  <article
    class="task-card"
    :data-task-id="task.id"
    :aria-label="`${task.title} – priority ${priority.label}`"
    draggable="true"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    tabindex="0"
  >
    <!-- Drag handle (desktop only) -->
    <span
      class="task-handle col-handle"
      :class="{ 'handle--hidden': !isDesktop }"
      :aria-hidden="!isDesktop ? 'true' : undefined"
      :aria-label="isDesktop ? 'Drag to reorder task' : undefined"
    >
      <svg viewBox="0 0 10 14" width="10" height="14" fill="none">
        <circle cx="3" cy="2.5" r="1" fill="currentColor" />
        <circle cx="7" cy="2.5" r="1" fill="currentColor" />
        <circle cx="3" cy="7" r="1" fill="currentColor" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
        <circle cx="3" cy="11.5" r="1" fill="currentColor" />
        <circle cx="7" cy="11.5" r="1" fill="currentColor" />
      </svg>
    </span>

    <!-- Title -->
    <p class="task-card__title">{{ task.title }}</p>

    <!-- Meta row -->
    <div class="task-card__meta">
      <!-- Priority badge -->
      <span
        class="task-card__priority"
        :style="{ color: priority.color, borderColor: priority.color + '33' }"
      >
        {{ priority.label }}
      </span>

      <!-- Due date -->
      <span
        v-if="dueDateLabel"
        class="task-card__due"
        :class="{ 'task-card__due--overdue': dueDateLabel.overdue }"
      >
        {{ dueDateLabel.text }}
      </span>
    </div>

    <!-- Tag dots + completed indicator -->
    <div v-if="tagDots.length > 0 || task.completed_at" class="task-card__footer">
      <div v-if="tagDots.length > 0" class="task-card__tags" aria-label="Tags">
        <span
          v-for="(color, i) in tagDots"
          :key="i"
          class="tag-dot"
          :style="{ backgroundColor: color }"
          aria-hidden="true"
        />
      </div>
      <span
        v-if="task.completed_at"
        class="task-card__done-mark"
        aria-label="Completed"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
          <path d="M2 6l3 3 5-5" stroke="var(--color-status-done)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>
  </article>
</template>

<style scoped>
.task-card {
  position: relative;
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 10px 12px 10px 28px;
  cursor: pointer;
  transition:
    border-color var(--motion-duration-fast) var(--motion-easing),
    box-shadow var(--motion-duration-fast) var(--motion-easing);
  outline: none;
  user-select: none;
}

.task-card:hover {
  border-color: var(--color-text-muted);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.task-card:focus-visible {
  border-color: var(--color-focus-ring);
  box-shadow: 0 0 0 2px var(--color-focus-ring);
}

.task-handle {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  cursor: grab;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 3px;
  transition: color var(--motion-duration-fast) var(--motion-easing);
  user-select: none;
  -webkit-user-drag: element;
}

.task-handle:hover {
  color: var(--color-text-secondary);
}

.task-handle:active {
  cursor: grabbing;
}

.handle--hidden {
  display: none;
}

.task-card__title {
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  line-height: var(--leading-body);
  margin: 0 0 6px;
  word-break: break-word;
}

.task-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.task-card__priority {
  font-size: var(--text-xs);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid;
  background-color: transparent;
  flex-shrink: 0;
}

.task-card__due {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.task-card__due--overdue {
  color: var(--color-status-blocked);
}

.task-card__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.task-card__tags {
  display: flex;
  align-items: center;
  gap: 3px;
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-card__done-mark {
  margin-left: auto;
  display: flex;
  align-items: center;
}
</style>
