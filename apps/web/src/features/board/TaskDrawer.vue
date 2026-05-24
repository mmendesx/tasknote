<script setup lang="ts">
/**
 * TaskDrawer — right-side drawer for task detail, notes, and file refs.
 * Props: open (v-model:open), taskId (number | null)
 * Tabs: Details | Notes | Files
 * Auto-patches on field change (debounced 500ms).
 */
import { ref, watch, computed } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import { Drawer, useToast } from '@tasknote/ui'
import { useDebounceFn } from '@vueuse/core'
import TaskDetailsTab from './TaskDetailsTab.vue'
import TaskNotesTab from './TaskNotesTab.vue'
import TaskFilesTab from './TaskFilesTab.vue'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { useNotesStore } from '@/stores/notes'
import { useFileRefsStore } from '@/stores/fileRefs'
import * as api from '@/api'
import type { Task, Note, FileRef, Priority } from '@tasknote/shared'

const props = defineProps<{
  open: boolean
  taskId: number | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const boardStore    = useCurrentBoardStore()
const notesStore    = useNotesStore()
const fileRefsStore = useFileRefsStore()
const toast         = useToast()

// ─── Form state ────────────────────────────────────────────────────────────
const task      = ref<Task | null>(null)
const title     = ref('')
const descMd    = ref('')
const priority  = ref<Priority>('medium')
const dueDate   = ref('')
const loading   = ref(false)

const columns   = computed(() => boardStore.board?.columns ?? [])
const taskNotes = computed<Note[]>(() =>
  notesStore.list.filter((n) => n.task_id === props.taskId)
)
const fileRefs = computed<FileRef[]>(() =>
  props.taskId ? fileRefsStore.getFor('task', props.taskId) : []
)

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
    :title="task?.title ?? 'Task'"
    width="32rem"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="loading" class="flex items-center justify-center py-12 text-text-muted text-sm">
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
