<script setup lang="ts">
import { computed } from 'vue'
import clsx from 'clsx'

type Status = 'todo' | 'doing' | 'blocked' | 'done'

const props = defineProps<{
  status: Status
  label?: string
}>()

const dotClasses: Record<Status, string> = {
  todo:    'bg-status-todo',
  doing:   'bg-status-doing',
  blocked: 'bg-status-blocked',
  done:    'bg-status-done',
}

const textClasses: Record<Status, string> = {
  todo:    'text-status-todo ring-status-todo/30',
  doing:   'text-status-doing ring-status-doing/30',
  blocked: 'text-status-blocked ring-status-blocked/30',
  done:    'text-status-done ring-status-done/30',
}

const defaultLabels: Record<Status, string> = {
  todo:    'Todo',
  doing:   'Doing',
  blocked: 'Blocked',
  done:    'Done',
}

const displayLabel = computed(() => props.label ?? defaultLabels[props.status])

const pillClasses = computed(() =>
  clsx(
    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
    'text-xs font-medium ring-1 bg-surface-elevated',
    textClasses[props.status],
  )
)

const dotClass = computed(() =>
  clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', dotClasses[props.status])
)
</script>

<template>
  <span :class="pillClasses">
    <span :class="dotClass" aria-hidden="true" />
    {{ displayLabel }}
  </span>
</template>
