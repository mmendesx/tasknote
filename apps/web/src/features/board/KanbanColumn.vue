<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import type { ColumnWithTasks, Task } from '@tasknote/shared'
import { useIsDesktop } from '@/composables/useIsDesktop'
import { useAnime } from '@/composables/useAnime'
import TaskCard from './TaskCard.vue'

const props = defineProps<{
  column: ColumnWithTasks
  tagColors?: Record<number, string>
  today?: string
}>()

const emit = defineEmits<{
  openTask: [taskId: number]
  moveTask: [taskId: number, toColumnId: number, toPosition: number]
}>()

const isDesktop = useIsDesktop()
const { animate, prefersReducedMotion } = useAnime()

const localTasks = ref<Task[]>([...props.column.tasks])

watch(
  () => props.column.tasks,
  (tasks) => { localTasks.value = [...tasks] },
  { deep: false }
)

const taskCount = computed(() => props.column.tasks.length)
const isOverLimit = computed(
  () => props.column.wip_limit != null && taskCount.value > props.column.wip_limit
)

const wipBadgeRef = ref<HTMLElement | null>(null)
let wasOverLimit = false

watch(isOverLimit, async (over) => {
  if (over && !wasOverLimit && !prefersReducedMotion.value && wipBadgeRef.value) {
    await nextTick()
    animate(wipBadgeRef.value, {
      scale: [1, 1.2, 1],
      duration: 300,
      easing: 'easeOutElastic(1, 0.6)',
    })
  }
  wasOverLimit = over
}, { immediate: false })

const taskListRef = ref<HTMLElement | null>(null)

const { option: sortableOption } = useSortable(taskListRef, localTasks, {
  group: 'tasks',
  animation: 150,
  draggable: '.task-card',
  ghostClass: 'task-ghost',
  dragClass: 'task-dragging',
  onEnd: (evt) => {
    const taskId = Number((evt.item as HTMLElement).dataset.taskId)
    const toColumnId = Number((evt.to as HTMLElement).dataset.columnId)
    const toPosition = evt.newIndex ?? 0

    // Cross-column move: SortableJS transplants the <li> into the target column's
    // DOM, leaving an orphan node Vue no longer tracks. Remove it so the store's
    // re-render is the single source of truth — the store ref-swaps props.column.tasks
    // for both source and target (spec-7), and the `props.column.tasks` watch above
    // resyncs each column's localTasks. Same-column reorder (vueuse onUpdate) untouched.
    if (evt.from && evt.to !== evt.from) {
      evt.item.parentNode?.removeChild(evt.item)
    }

    if (!taskId || !toColumnId) return
    emit('moveTask', taskId, toColumnId, toPosition)
  },
})

onMounted(() => {
  if (!isDesktop.value) sortableOption('disabled', true)
  watch(isDesktop, (desktop) => sortableOption('disabled', !desktop))
})

function onListDragStart(evt: DragEvent) {
  const card = (evt.target as HTMLElement).closest('.task-card') as HTMLElement | null
  if (!card || prefersReducedMotion.value) return
  animate(card, {
    scale: 1.03,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
    duration: 150,
    easing: 'easeOutQuad',
  })
}

function onListDragEnd(evt: DragEvent) {
  const card = (evt.target as HTMLElement).closest('.task-card') as HTMLElement | null
  if (!card || prefersReducedMotion.value) return
  animate(card, {
    scale: 1,
    boxShadow: '0 0 0 rgba(0, 0, 0, 0)',
    duration: 100,
    easing: 'easeOutQuad',
  })
}
</script>

<template>
  <section
    class="kanban-column"
    :aria-label="`${column.name} column, ${taskCount} tasks`"
  >
    
    <header class="kanban-column__header">
      <h2 class="kanban-column__name">{{ column.name }}</h2>

      <span
        ref="wipBadgeRef"
        class="kanban-column__count"
        :class="{ 'kanban-column__count--over': isOverLimit }"
        :title="isOverLimit ? `WIP limit exceeded: ${taskCount} / ${column.wip_limit}` : undefined"
      >
        <template v-if="isOverLimit && column.wip_limit != null">
          {{ taskCount }} / {{ column.wip_limit }}
        </template>
        <template v-else>
          {{ taskCount }}
        </template>
      </span>
    </header>

    <div
      ref="taskListRef"
      class="kanban-column__tasks"
      :data-column-id="column.id"
      @dragstart="onListDragStart"
      @dragend="onListDragEnd"
    >
      <TaskCard
        v-for="task in localTasks"
        :key="task.id"
        :task="task"
        :tag-colors="tagColors"
        :today="today"
        @open="(id) => emit('openTask', id)"
      />

      <p v-if="localTasks.length === 0" class="kanban-column__empty" aria-live="polite">
        No tasks
      </p>
    </div>

  </section>
</template>

<style scoped>
.kanban-column {
  display: flex;
  flex-direction: column;
  /* Grow to share the canvas width equally; min-width keeps cards readable and
     lets the row scroll horizontally once columns would get too narrow. */
  flex: 1 1 0;
  min-width: 280px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  max-height: 100%;
  overflow: hidden;
}

.kanban-column__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.kanban-column__name {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kanban-column__count {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  background-color: var(--color-surface-elevated);
  padding: 1px 6px;
  border-radius: 999px;
  flex-shrink: 0;
  transition: color var(--motion-duration-fast) var(--motion-easing);
}

.kanban-column__count--over {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-status-blocked) 30%, transparent);
}

.kanban-column__tasks {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 60px;
}

.kanban-column__empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-align: center;
  padding: 16px 0;
  margin: 0;
}

:global(.task-ghost) {
  opacity: 0.4;
  border: 2px dashed var(--color-accent);
  border-radius: var(--radius-card);
  background-color: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

:global(.task-dragging) {
  opacity: 0.9;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
</style>
