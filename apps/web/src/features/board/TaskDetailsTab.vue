<script setup lang="ts">
/**
 * TaskDetailsTab — Details pane inside TaskDrawer.
 * Handles title, description, priority, due-date, column, timestamps, and archive.
 */
import { ref, computed } from 'vue'
import { Button, Input } from '@tasknote/ui'
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

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-text-secondary" for="task-priority">Priority</label>
      <select
        id="task-priority"
        :value="priority"
        class="rounded-control border border-border bg-surface px-3 py-2 text-sm
               text-text-primary focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-accent"
        @change="emit('update:priority', ($event.target as HTMLSelectElement).value as Priority)"
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </div>

    <Input
      :model-value="dueDate"
      label="Due date"
      type="date"
      @update:model-value="emit('update:dueDate', $event)"
    />

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-text-secondary" for="task-column">Column</label>
      <select
        id="task-column"
        :value="task.column_id"
        class="rounded-control border border-border bg-surface px-3 py-2 text-sm
               text-text-primary focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-accent"
        @change="emit('columnChange', $event)"
      >
        <option v-for="col in columns" :key="col.id" :value="col.id">
          {{ col.name }}
        </option>
      </select>
    </div>

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
