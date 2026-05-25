<script setup lang="ts">
/**
 * TaskDrawer — right-side drawer for task detail, notes, and file refs.
 * Props: open (v-model:open), taskId (number | null), newTaskDefaults (optional)
 * Tabs: Details | Notes | Files
 * Auto-patches on field change (debounced 500ms).
 * When newTaskDefaults is set and taskId is null, renders a create form instead.
 */
import { ref, watch, computed } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import { Drawer, DatePicker, useToast } from '@tasknote/ui'
import { useDebounceFn } from '@vueuse/core'
import TaskDetailsTab from './TaskDetailsTab.vue'
import TaskNotesTab from './TaskNotesTab.vue'
import TaskFilesTab from './TaskFilesTab.vue'
import TagPicker from '@/features/tags/TagPicker.vue'
import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'
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

// ─── Create mode ───────────────────────────────────────────────────────────
const isCreateMode = computed(() => props.taskId === null && props.newTaskDefaults != null)

// Separate state for create form — avoids cross-contamination with edit state
const createTitle      = ref('')
const createDescMd     = ref('')
const createPriority   = ref<Priority>('low')
const createColumnId   = ref<number>(0)
const createDueDate    = ref('')
const isSavingCreate   = ref(false)

// Seed create form fields when entering create mode
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
      due_date:       createDueDate.value
        ? new Date(createDueDate.value).toISOString()
        : null,
    })
    if (created) {
      emit('created', created.id)
    }
  } catch {
    // boardStore handles toast
  } finally {
    isSavingCreate.value = false
  }
}

// ─── Edit form state ───────────────────────────────────────────────────────
const task      = ref<Task | null>(null)
const title     = ref('')
const descMd    = ref('')
const priority  = ref<Priority>('medium')
const dueDate   = ref('')
const loading   = ref(false)

const columns        = computed(() => boardStore.board?.columns ?? [])
const drawerTitle    = computed(() => isCreateMode.value ? 'New task' : (task.value?.title ?? 'Task'))
const taskNotes = computed<Note[]>(() =>
  notesStore.list.filter((n) => n.task_id === props.taskId)
)
const fileRefs = computed<FileRef[]>(() =>
  props.taskId ? fileRefsStore.getFor('task', props.taskId) : []
)

// Resolve tag_ids from board store (optimistic) or fall back to drawer's loaded task
const tagIds = computed<number[]>(() => {
  if (!props.taskId) return []
  for (const col of boardStore.board?.columns ?? []) {
    const found = col.tasks.find((t) => t.id === props.taskId)
    if (found) return found.tag_ids ?? []
  }
  return task.value?.tag_ids ?? []
})

function onTagIdsChange(ids: number[]): void {
  // TagPicker already called boardStore.addTag / removeTag — tag_ids
  // on the board task are already optimistically updated. No extra action needed.
  void ids
}

// ─── Load on taskId change ─────────────────────────────────────────────────
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
      dueDate.value  = t.due_date
        ? new Date(t.due_date).toISOString().substring(0, 10)
        : ''
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

// ─── Debounced PATCH ───────────────────────────────────────────────────────
const patchTask = useDebounceFn(async (dto: Parameters<typeof boardStore.updateTask>[1]) => {
  if (!props.taskId) return
  try { await boardStore.updateTask(props.taskId, dto) } catch { /* boardStore toasts */ }
}, 500)

function onTitleChange(val: string)    { title.value = val;    if (val.trim()) patchTask({ title: val.trim() }) }
function onDescChange(val: string)     { descMd.value = val;   patchTask({ description_md: val }) }
function onPriorityChange(val: Priority) { priority.value = val; patchTask({ priority: val }) }
function onDueDateChange(val: string)  {
  dueDate.value = val
  patchTask({ due_date: val ? new Date(val).toISOString() : null })
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
  <Drawer
    :open="open"
    :title="drawerTitle"
    width="32rem"
    @update:open="emit('update:open', $event)"
  >
    <!-- Create mode form -->
    <template v-if="isCreateMode">
      <form class="create-form" @submit.prevent="saveNewTask">
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

        <div class="create-form__row">
          <div class="create-form__field">
            <label for="create-priority" class="create-form__label">Priority</label>
            <select id="create-priority" v-model="createPriority" class="create-form__select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div class="create-form__field">
            <label for="create-column" class="create-form__label">Column</label>
            <select id="create-column" v-model="createColumnId" class="create-form__select">
              <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.name }}</option>
            </select>
          </div>
        </div>

        <div class="create-form__field">
          <DatePicker
            v-model="createDueDate"
            label="Due date"
          />
        </div>

        <div class="create-form__actions">
          <button
            type="submit"
            class="create-form__btn create-form__btn--primary"
            :disabled="!createTitle.trim() || isSavingCreate"
          >
            {{ isSavingCreate ? 'Saving…' : 'Save task' }}
          </button>
          <button
            type="button"
            class="create-form__btn create-form__btn--ghost"
            @click="emit('update:open', false)"
          >
            Cancel
          </button>
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
                   data-[state=active]:text-text-primary data-[state=active]:border-b-2
                   data-[state=active]:border-accent data-[state=active]:-mb-px
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
  </Drawer>
</template>

<style scoped>
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

/* Compact the description editor height in create mode */
.create-form__field--desc :deep(.milkdown-host) {
  min-height: 5rem;
}

.create-form__field--desc :deep(.ProseMirror) {
  min-height: 3.5rem;
}

.create-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

.create-form__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.create-form__btn {
  padding: 8px 16px;
  border-radius: var(--radius-control);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--motion-duration-fast), opacity var(--motion-duration-fast);
}

.create-form__btn--primary {
  background-color: var(--color-accent);
  color: var(--color-bg);
  border: none;
}

.create-form__btn--primary:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
}

.create-form__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.create-form__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.create-form__btn--ghost:hover {
  background-color: var(--color-surface-hover, color-mix(in srgb, var(--color-border) 40%, transparent));
  color: var(--color-text-primary);
}
</style>
