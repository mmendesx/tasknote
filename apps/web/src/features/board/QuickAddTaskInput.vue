<script setup lang="ts">
/**
 * QuickAddTaskInput — inline new-task input for Kanban columns.
 *
 * ICT-18 (KanbanColumn) integration contract:
 *   - Import and mount inside KanbanColumn.vue at the top of the task list
 *   - Pass :column-id="column.id"
 *   - Pass :active="quickAddActiveColumnId === column.id"
 *     (quickAddActiveColumnId from useFocusedColumn())
 *   - Handle @submit: (title: string) => currentBoardStore.createTask(columnId, { title, priority: 'medium', column_id: columnId })
 *   - Handle @cancel: () => clearQuickAdd()
 *
 * The component auto-focuses when :active becomes true.
 * Enter submits (validates non-empty title); Esc cancels.
 */

import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  columnId: number
  active: boolean
}>()

const emit = defineEmits<{
  submit: [title: string]
  cancel: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const title = ref('')
const validationError = ref<string | null>(null)

// Auto-focus when active becomes true
watch(
  () => props.active,
  async (isActive) => {
    if (isActive) {
      title.value = ''
      validationError.value = null
      await nextTick()
      inputRef.value?.focus()
    }
  },
  { immediate: true }
)

function handleSubmit() {
  const trimmed = title.value.trim()

  if (!trimmed) {
    validationError.value = 'Title is required'
    return
  }

  if (trimmed.length > 200) {
    validationError.value = 'Title must be ≤200 characters'
    return
  }

  emit('submit', trimmed)
  title.value = ''
  validationError.value = null
}

function handleCancel() {
  title.value = ''
  validationError.value = null
  emit('cancel')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleSubmit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    handleCancel()
  }
}

function handleBlur() {
  // On blur without submit, cancel silently
  if (props.active && title.value.trim() === '') {
    handleCancel()
  }
}
</script>

<template>
  <div
    v-if="active"
    class="px-3 pt-2 pb-1"
    role="form"
    :aria-label="`Add task to column`"
  >
    <input
      ref="inputRef"
      v-model="title"
      type="text"
      placeholder="Task title…"
      maxlength="201"
      class="w-full rounded-control border px-3 py-2 text-sm
             bg-surface border-border text-text-primary
             placeholder:text-text-muted
             focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent
             transition-colors"
      style="transition-duration: var(--motion-duration-fast)"
      :aria-invalid="validationError !== null"
      :aria-describedby="validationError ? 'quick-add-error' : undefined"
      @keydown="handleKeydown"
      @blur="handleBlur"
    />
    <p
      v-if="validationError"
      id="quick-add-error"
      role="alert"
      class="mt-1 text-xs text-red-400"
    >
      {{ validationError }}
    </p>
    <p class="mt-1 text-xs text-text-muted">
      <span class="inline-flex items-center gap-1">
        Press
        <kbd class="inline-flex items-center justify-center rounded px-1 py-0.5 text-xs font-mono
                    bg-surface-elevated border border-border shadow-[0_1px_0_0_var(--color-border)]">Enter</kbd>
        to save,
        <kbd class="inline-flex items-center justify-center rounded px-1 py-0.5 text-xs font-mono
                    bg-surface-elevated border border-border shadow-[0_1px_0_0_var(--color-border)]">Esc</kbd>
        to cancel
      </span>
    </p>
  </div>
</template>
