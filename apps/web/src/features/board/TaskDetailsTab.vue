<script setup lang="ts">

import { ref, computed } from 'vue'
import { Button, Input, DatePicker, Select } from '@tasknote/ui'
import type { SelectOption } from '@tasknote/ui'
import MilkdownEditor from './MilkdownEditor.vue'
import type { Task, ColumnWithTasks, Priority } from '@tasknote/shared'

const props = defineProps<{
  task: Task
  title: string
  descMd: string
  priority: Priority
  dueDate: string
  columns: ColumnWithTasks[]
}>()

const emit = defineEmits<{
  'update:title':    [value: string]
  'update:descMd':   [value: string]
  'update:priority': [value: Priority]
  'update:dueDate':  [value: string]
  columnChange:      [event: Event]
  archive:           []
}>()

const archiveConfirm = ref(false)

const priorityOptions: SelectOption[] = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const columnOptions = computed<SelectOption[]>(() =>
  props.columns.map((c) => ({ value: c.id, label: c.name }))
)

function onColumnSelect(value: string | number): void {
  emit('columnChange', { target: { value: String(value) } } as unknown as Event)
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Input
      :model-value="title"
      label="Title"
      placeholder="Task title"
      :maxlength="200"
      @update:model-value="emit('update:title', $event)"
    />

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-text-secondary">Description</label>
      <MilkdownEditor
        :model-value="descMd"
        @update:model-value="emit('update:descMd', $event)"
      />
    </div>

    <Select
      id="task-priority"
      label="Priority"
      :model-value="priority"
      :options="priorityOptions"
      @update:model-value="emit('update:priority', $event as Priority)"
    />

    <DatePicker
      :model-value="dueDate"
      label="Due date"
      @update:model-value="emit('update:dueDate', $event)"
    />

    <Select
      id="task-column"
      label="Column"
      :model-value="task.column_id"
      :options="columnOptions"
      @update:model-value="onColumnSelect"
    />

    <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
      <dt>Created</dt><dd>{{ formatDate(task.created_at) }}</dd>
      <dt>Updated</dt><dd>{{ formatDate(task.updated_at) }}</dd>
      <template v-if="task.completed_at">
        <dt>Completed</dt><dd>{{ formatDate(task.completed_at) }}</dd>
      </template>
    </dl>

    <div class="border-t border-border pt-4 mt-2">
      <template v-if="!archiveConfirm">
        <Button variant="danger" size="sm" @click="archiveConfirm = true">Archive task</Button>
      </template>
      <template v-else>
        <p class="text-sm text-text-secondary mb-2">Archive this task?</p>
        <div class="flex gap-2">
          <Button variant="danger" size="sm" @click="emit('archive'); archiveConfirm = false">
            Yes, archive
          </Button>
          <Button variant="ghost" size="sm" @click="archiveConfirm = false">Cancel</Button>
        </div>
      </template>
    </div>
  </div>
</template>
