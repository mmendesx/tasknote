<script setup lang="ts">

import { ref, watch, computed } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import { Dialog, DatePicker, Button, Select, useToast } from '@tasknote/ui'
import type { SelectOption } from '@tasknote/ui'
import TaskDetailsTab from './TaskDetailsTab.vue'
import TaskNotesTab from './TaskNotesTab.vue'
import TaskFilesTab from './TaskFilesTab.vue'
import TagPicker from '@/features/tags/TagPicker.vue'
import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'
import PriorityChips from './PriorityChips.vue'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { useNotesStore } from '@/stores/notes'
import { useFileRefsStore } from '@/stores/fileRefs'
import { useTagsStore } from '@/stores/tags'
import * as api from '@/api'
import type { Task, Note, FileRef, Priority } from '@tasknote/shared'

const props = defineProps<{
  open: boolean
  taskId: number | null
  newTaskDefaults?: {
    columnId: number
    priority: Priority
  }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [taskId: number]
}>()

const boardStore    = useCurrentBoardStore()
const notesStore    = useNotesStore()
const fileRefsStore = useFileRefsStore()
const tagsStore     = useTagsStore()
const toast         = useToast()

const isCreateMode = computed(() => props.taskId === null && props.newTaskDefaults != null)

const createTitle      = ref('')
const createDescMd     = ref('')
const createPriority   = ref<Priority>('low')
const createColumnId   = ref<number>(0)
const createDueDate    = ref('')
const isSavingCreate   = ref(false)

watch(isCreateMode, (entering) => {
  if (entering && props.newTaskDefaults) {
    createTitle.value    = ''
    createDescMd.value   = ''
    createPriority.value = props.newTaskDefaults.priority
    createColumnId.value = props.newTaskDefaults.columnId
    createDueDate.value  = ''
  }
}, { immediate: true })

async function saveNewTask(): Promise<void> {
  if (!createTitle.value.trim() || isSavingCreate.value) return
  isSavingCreate.value = true
  try {
    const created = await boardStore.createTask(createColumnId.value, {
      title:          createTitle.value.trim(),
      priority:       createPriority.value,
      column_id:      createColumnId.value,
      description_md: createDescMd.value.trim() || null,
      due_date:       createDueDate.value || null,
    })
    if (created) {
      emit('created', created.id)
    }
  } catch {

  } finally {
    isSavingCreate.value = false
  }
}

const task      = ref<Task | null>(null)
const title     = ref('')
const descMd    = ref('')
const priority  = ref<Priority>('medium')
const dueDate   = ref('')
const loading   = ref(false)

const columns      = computed(() => boardStore.board?.columns ?? [])
const dialogTitle  = computed(() => isCreateMode.value ? 'New task' : (task.value?.title ?? 'Task'))

const columnOptions = computed<SelectOption[]>(() =>
  columns.value.map((c) => ({ value: c.id, label: c.name }))
)
const taskNotes = computed<Note[]>(() =>
  props.taskId ? notesStore.forTask(props.taskId) : []
)
const fileRefs = computed<FileRef[]>(() =>
  props.taskId ? fileRefsStore.getFor('task', props.taskId) : []
)

const tagIds = computed<number[]>(() => {
  if (!props.taskId) return []
  for (const col of boardStore.board?.columns ?? []) {
    const found = col.tasks.find((t) => t.id === props.taskId)
    if (found) return found.tag_ids ?? []
  }
  return task.value?.tag_ids ?? []
})

function onTagIdsChange(ids: number[]): void {

  void ids
}

watch(
  () => props.taskId,
  async (id) => {
    if (!id) { task.value = null; return }
    loading.value = true
    try {
      const t = await api.tasks.getTask(id)
      task.value     = t
      title.value    = t.title
      descMd.value   = t.description_md ?? ''
      priority.value = t.priority
      dueDate.value  = t.due_date ? t.due_date.slice(0, 10) : ''
    } catch (err) {
      toast.error('Load failed', err instanceof Error ? err.message : 'Could not load task')
    } finally {
      loading.value = false
    }
    notesStore.load(id)
    fileRefsStore.loadFor('task', id)
  },
  { immediate: true }
)

const isSaving = ref(false)

const isDirty = computed(() => {
  if (!task.value) return false
  // Compare raw YYYY-MM-DD strings (FR-4: no ISO conversion)
  const origDue = task.value.due_date ? task.value.due_date.slice(0, 10) : ''
  return (
    title.value.trim() !== task.value.title ||
    descMd.value !== (task.value.description_md ?? '') ||
    priority.value !== task.value.priority ||
    dueDate.value !== origDue
  )
})

function onTitleChange(val: string)      { title.value = val }
function onDescChange(val: string)       { descMd.value = val }
function onPriorityChange(val: Priority) { priority.value = val }
function onDueDateChange(val: string)    { dueDate.value = val }

async function saveTask(): Promise<void> {
  if (!props.taskId || !task.value || isSaving.value) return
  if (!isDirty.value) {
    toast.success('No changes', 'Nothing to save')
    return
  }
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    toast.error('Title required', 'Task title cannot be empty')
    return
  }
  isSaving.value = true
  try {
    await boardStore.updateTask(props.taskId, {
      title:          trimmedTitle,
      description_md: descMd.value,
      priority:       priority.value,
      due_date:       dueDate.value || null,
    })
    const refreshed = await api.tasks.getTask(props.taskId)
    task.value = refreshed
    toast.success('Saved', 'Task updated')
  } catch {
  } finally {
    isSaving.value = false
  }
}

function discardChanges(): void {
  if (!task.value) return
  title.value    = task.value.title
  descMd.value   = task.value.description_md ?? ''
  priority.value = task.value.priority
  dueDate.value  = task.value.due_date ? task.value.due_date.slice(0, 10) : ''
}

async function onColumnChange(event: Event): Promise<void> {
  if (!props.taskId) return
  const colId = Number((event.target as HTMLSelectElement).value)
  await boardStore.moveTask(props.taskId, colId, 0)
}

async function onArchive(): Promise<void> {
  if (!props.taskId) return
  await boardStore.softDeleteTask(props.taskId)
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    :title="dialogTitle"
    @update:open="emit('update:open', $event)"
  >
    <div class="task-modal__body">
      <template v-if="isCreateMode">
        <form id="task-create-form" class="create-form" @submit.prevent="saveNewTask">
          <div class="create-form__field">
            <label for="create-title" class="create-form__label">Title <span class="create-form__required">*</span></label>
            <input
              id="create-title"
              v-model="createTitle"
              type="text"
              class="create-form__input"
              placeholder="Task title"
              required
              autofocus
            />
          </div>

          <div class="create-form__field create-form__field--desc">
            <label class="create-form__label">Description</label>
            <MilkdownEditor v-model="createDescMd" />
          </div>

          <div class="create-form__field">
            <label class="create-form__label">Priority</label>
            <PriorityChips v-model="createPriority" />
          </div>

          <Select
            id="create-column"
            label="Column"
            :model-value="createColumnId"
            :options="columnOptions"
            @update:model-value="createColumnId = Number($event)"
          />

          <div class="create-form__field">
            <DatePicker
              v-model="createDueDate"
              label="Due date"
            />
          </div>
        </form>
      </template>

      <div v-else-if="loading" class="flex items-center justify-center py-12 text-text-muted text-sm">
        Loading…
      </div>

      <template v-else-if="task">
        <TabsRoot default-value="details" class="flex flex-col gap-0">
          <TabsList
            class="flex gap-1 border-b border-border mb-4"
            aria-label="Task sections"
          >
            <TabsTrigger
              v-for="tab in ['details', 'notes', 'files']"
              :key="tab"
              :value="tab"
              class="px-3 py-1.5 text-sm capitalize text-text-secondary rounded-t
                     data-[state=active]:text-text-primary data-[state=active]:font-semibold
                     data-[state=active]:border-b-2 data-[state=active]:border-text-muted
                     data-[state=active]:-mb-px
                     hover:text-text-primary transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {{ tab }}
              <span v-if="tab === 'notes' && taskNotes.length" class="ml-1 text-xs text-text-muted">
                ({{ taskNotes.length }})
              </span>
              <span v-if="tab === 'files' && fileRefs.length" class="ml-1 text-xs text-text-muted">
                ({{ fileRefs.length }})
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" class="outline-none">
            <TaskDetailsTab
              :task="task"
              :title="title"
              :desc-md="descMd"
              :priority="priority"
              :due-date="dueDate"
              :columns="columns"
              @update:title="onTitleChange"
              @update:desc-md="onDescChange"
              @update:priority="onPriorityChange"
              @update:due-date="onDueDateChange"
              @column-change="onColumnChange"
              @archive="onArchive"
            />
            <div v-if="tagsStore.list.length" class="mt-4">
              <TagPicker
                :model-value="tagIds"
                :task-id="task.id"
                @update:model-value="onTagIdsChange"
              />
            </div>
          </TabsContent>

          <TabsContent value="notes" class="outline-none">
            <TaskNotesTab :task-id="task.id" :notes="taskNotes" />
          </TabsContent>

          <TabsContent value="files" class="outline-none">
            <TaskFilesTab :task-id="task.id" :file-refs="fileRefs" />
          </TabsContent>
        </TabsRoot>
      </template>

      <div v-else class="flex items-center justify-center py-12 text-text-muted text-sm">
        No task selected.
      </div>
    </div>

    <template #footer>
      <template v-if="isCreateMode">
        <Button
          variant="ghost"
          size="md"
          @click="emit('update:open', false)"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="task-create-form"
          variant="primary"
          size="md"
          :disabled="!createTitle.trim() || isSavingCreate"
        >
          {{ isSavingCreate ? 'Saving…' : 'Save task' }}
        </Button>
      </template>
      <template v-else-if="task">
        <span v-if="isDirty" class="edit-form__dirty">Unsaved changes</span>
        <Button
          variant="ghost"
          size="md"
          :disabled="isSaving"
          @click="discardChanges"
        >
          Discard
        </Button>
        <Button
          variant="primary"
          size="md"
          :disabled="isSaving"
          @click="saveTask"
        >
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </Button>
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.task-modal__body {
  max-height: 70vh;
  overflow-y: auto;
  /* Compensate for Dialog's p-6 padding on the body slot */
  margin: 0 -4px;
  padding: 0 4px;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.create-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.create-form__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.create-form__required {
  color: var(--color-status-blocked);
}

.create-form__field--desc :deep(.milkdown-host) {
  min-height: 5rem;
}

.create-form__field--desc :deep(.ProseMirror) {
  min-height: 3.5rem;
}

.create-form__input,
.create-form__select {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  line-height: 1.5;
  width: 100%;
  transition: border-color var(--motion-duration-fast);
}

.create-form__input:focus,
.create-form__select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}


.edit-form__dirty {
  margin-right: auto;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
