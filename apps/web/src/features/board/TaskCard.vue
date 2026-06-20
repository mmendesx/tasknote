<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@tasknote/shared'
import { useIsDesktop } from '@/composables/useIsDesktop'
import { useAnime } from '@/composables/useAnime'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { useTagsStore } from '@/stores/tags'
import { DropdownMenu } from '@tasknote/ui'
import type { MenuItemDef } from '@tasknote/ui'
import { priorityConfig } from './priorityConfig'

const props = defineProps<{
  task: Task
  tagColors?: Record<number, string>
  today?: string
}>()

const tagsStore = useTagsStore()

const emit = defineEmits<{
  open: [taskId: number]
}>()

const isDesktop = useIsDesktop()
const { animate, prefersReducedMotion } = useAnime()
const boardStore = useCurrentBoardStore()


const priority = computed(() => priorityConfig[props.task.priority] ?? priorityConfig.medium)

function formatDueDate(val: string): string {
  const day = val.slice(0, 10)
  const d = new Date(`${day}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const dueDateLabel = computed(() => {
  if (!props.task.due_date) return null
  const day = props.task.due_date.slice(0, 10)
  const d = new Date(`${day}T12:00:00Z`)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: 'Overdue', overdue: true }
  if (diffDays === 0) return { text: 'Today', overdue: false }
  if (diffDays === 1) return { text: 'Tomorrow', overdue: false }
  return { text: formatDueDate(props.task.due_date), overdue: false }
})

const TAG_CHIP_LIMIT = 2

// All of the task's tags resolved to { id, name, color }, skipping unknowns.
const allTags = computed(() =>
  (props.task.tag_ids ?? [])
    .map((id) => {
      const tag = tagsStore.list.find((t) => t.id === id)
      if (!tag) return null
      return {
        id,
        name: tag.name,
        color: props.tagColors?.[id] ?? tag.color ?? 'var(--color-text-muted)',
      }
    })
    .filter((t): t is { id: number; name: string; color: string } => t !== null),
)

const tagNames = computed(() => allTags.value.map((t) => t.name))

// Visible chips (cap) + a count/label for the overflow "+N" chip.
const visibleTags = computed(() => allTags.value.slice(0, TAG_CHIP_LIMIT))
const overflowTags = computed(() => allTags.value.slice(TAG_CHIP_LIMIT))
const overflowLabel = computed(() =>
  overflowTags.value.length
    ? `${overflowTags.value.length} more: ${overflowTags.value.map((t) => t.name).join(', ')}`
    : undefined,
)

// ICT-66: committed-on marker
const committedMarker = computed<'today' | 'earlier' | null>(() => {
  if (!props.task.committed_on) return null
  const committed = String(props.task.committed_on).slice(0, 10)
  const refDay = props.today ?? null
  if (!refDay) return null
  if (committed === refDay) return 'today'
  if (committed < refDay && !props.task.completed_at && !props.task.archived_at) return 'earlier'
  return null
})

// FR-7: "Move task" dropdown items (one per column in the board)
const moveColumnItems = computed<MenuItemDef[]>(() => {
  const columns = boardStore.board?.columns ?? []
  return columns.map((col) => ({
    type: 'item' as const,
    label: col.name,
    onSelect: () => boardStore.moveTask(props.task.id, col.id, 0),
  }))
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

function handleOpen() {
  emit('open', props.task.id)
}
</script>

<template>
  <!-- FR-8a: outer article has no tabindex; inner button is the keyboard activator -->
  <article
    class="task-card"
    :data-task-id="task.id"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <!-- Drag handle — sibling, not inside the open button -->
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

    <!-- Inner button: primary keyboard activator (FR-8a) -->
    <button
      type="button"
      class="task-card__open"
      :aria-label="`Open task: ${task.title}`"
      @click="handleOpen"
    >
      <p class="task-card__title">{{ task.title }}</p>

      <div class="task-card__meta">
        <span
          class="task-card__priority"
          :style="{ color: priority.color, borderColor: priority.color + '33' }"
        >
          {{ priority.label }}
        </span>

        <span
          v-if="dueDateLabel"
          class="task-card__due"
          :class="{ 'task-card__due--overdue': dueDateLabel.overdue }"
        >
          {{ dueDateLabel.text }}
        </span>
      </div>

      <!-- Tags rendered as named chips, tinted by tag color (cap + overflow) -->
      <div v-if="allTags.length > 0 || task.completed_at || committedMarker" class="task-card__footer">
        <div v-if="allTags.length" class="task-card__tags">
          <span
            v-for="tag in visibleTags"
            :key="tag.id"
            class="task-card__tag"
            :style="{ borderColor: tag.color + '66' }"
          >
            <span
              class="task-card__tag-dot"
              :style="{ backgroundColor: tag.color }"
              aria-hidden="true"
            />
            {{ tag.name }}
          </span>
          <span
            v-if="overflowTags.length"
            class="task-card__tag task-card__tag--overflow"
            :aria-label="overflowLabel"
            :title="overflowLabel"
          >
            +{{ overflowTags.length }}
          </span>
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

        <!-- ICT-66: committed-on marker dot -->
        <span
          v-if="committedMarker === 'today'"
          class="task-card__committed task-card__committed--today"
          aria-label="Committed today"
        />
        <span
          v-else-if="committedMarker === 'earlier'"
          class="task-card__committed task-card__committed--earlier"
          aria-label="Committed earlier"
        />
      </div>
    </button>

    <!-- FR-7: "Move task" dropdown — visible on hover + focus-within (ICT-40) -->
    <div class="task-card__actions">
      <DropdownMenu
        :items="moveColumnItems"
        side="bottom"
        align="end"
      >
        <template #trigger>
          <button
            type="button"
            class="task-card__menu-btn"
            :aria-label="`Move task: ${task.title}`"
            title="Move task"
            @click.stop
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path d="M2 8h12M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </template>
      </DropdownMenu>
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
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.task-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.4;
  /* Name uses a theme text color, not the (arbitrary, user-chosen) tag color,
     so it stays legible on any tag color / theme. The tag color tints the
     border and the leading dot only. */
  color: var(--color-text-secondary);
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.task-card__tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-card__tag--overflow {
  color: var(--color-text-muted);
  border-color: var(--color-border);
}

.task-card__done-mark {
  margin-left: auto;
  display: flex;
  align-items: center;
}

/* FR-8a: inner button is the full-card keyboard/click activator */
.task-card__open {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  color: inherit;
  font: inherit;
}

/* FR-7 + ICT-43: move-task dropdown — hidden by default, revealed on hover/focus-within */
.task-card__actions {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-duration-fast) var(--motion-easing);
}

.task-card:hover .task-card__actions,
.task-card:focus-within .task-card__actions {
  opacity: 1;
  pointer-events: auto;
}

/* Always visible on touch devices (no hover) */
@media (hover: none) {
  .task-card__actions {
    opacity: 0.6;
    pointer-events: auto;
  }
}

.task-card__menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 2px;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--motion-duration-fast) var(--motion-easing),
              background var(--motion-duration-fast) var(--motion-easing);
}

.task-card__menu-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.task-card__menu-btn:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

/* ICT-66: committed-on marker */
.task-card__committed {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: auto;
}

.task-card__committed--today {
  background-color: var(--color-accent);
}

.task-card__committed--earlier {
  background-color: var(--color-text-muted);
  opacity: 0.5;
}
</style>
