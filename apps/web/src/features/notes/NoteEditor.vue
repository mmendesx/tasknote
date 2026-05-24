<script setup lang="ts">
/**
 * NoteEditor — right-panel editor for a single note.
 * Props: noteId (number | null)
 * Features: title input, Milkdown body, pin toggle, task link picker, delete.
 * Title + body save debounced (500ms). Pin saves immediately.
 */
import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Input, Button, useToast } from '@tasknote/ui'
import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'
import TaskLinkPicker from './TaskLinkPicker.vue'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@tasknote/shared'

const props = defineProps<{
  noteId: number | null
}>()

const emit = defineEmits<{
  deleted: [id: number]
}>()

const notesStore = useNotesStore()
const toast = useToast()

const note = ref<Note | null>(null)
const title = ref('')
const bodyMd = ref('')
const loading = ref(false)
const deleteConfirm = ref(false)

// ─── Derived title (first heading / first line) ──────────────────────────────

function deriveTitleClient(md: string): string {
  const heading = md.match(/^#{1,6}\s+(.+)$/m)
  if (heading) return heading[1].trim()
  const line = md.split('\n').find((l) => l.trim())
  return line
    ? line.replace(/^[#*>\-]+\s*/, '').trim().slice(0, 60) || 'Untitled'
    : 'Untitled'
}

const displayTitle = computed(() =>
  title.value || (note.value ? deriveTitleClient(note.value.body_md) : '')
)

// ─── Load note when noteId changes ───────────────────────────────────────────

watch(
  () => props.noteId,
  async (id) => {
    if (!id) { note.value = null; return }
    deleteConfirm.value = false
    loading.value = true
    try {
      // Pull from store first for instant render, then sync from API if needed
      const cached = notesStore.list.find((n) => n.id === id)
      if (cached) {
        note.value = cached
        title.value = cached.title
        bodyMd.value = cached.body_md
      } else {
        // Note not in store: re-load all notes so the store stays consistent
        await notesStore.load()
        const found = notesStore.list.find((n) => n.id === id)
        if (found) {
          note.value = found
          title.value = found.title
          bodyMd.value = found.body_md
        }
      }
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// ─── Debounced save for title + body ─────────────────────────────────────────

const debouncedSave = useDebounceFn(async () => {
  if (!note.value) return
  try {
    await notesStore.update(note.value.id, {
      title: title.value,
      body_md: bodyMd.value,
    })
  } catch {
    toast.error('Save failed', 'Could not save note')
  }
}, 500)

function onTitleInput(val: string): void {
  title.value = val
  debouncedSave()
}

function onBodyUpdate(val: string): void {
  bodyMd.value = val
  debouncedSave()
}

// ─── Pin toggle (saves immediately) ──────────────────────────────────────────

async function togglePin(): Promise<void> {
  if (!note.value) return
  const next = !note.value.pinned
  try {
    await notesStore.update(note.value.id, { pinned: next })
    // Reflect in local ref after store update
    const updated = notesStore.list.find((n) => n.id === note.value!.id)
    if (updated) note.value = updated
  } catch {
    toast.error('Pin failed', 'Could not update pin status')
  }
}

// ─── Task link ────────────────────────────────────────────────────────────────

async function onTaskLink(taskId: number | null): Promise<void> {
  if (!note.value) return
  try {
    await notesStore.update(note.value.id, { task_id: taskId })
    const updated = notesStore.list.find((n) => n.id === note.value!.id)
    if (updated) note.value = updated
  } catch {
    toast.error('Link failed', 'Could not link task')
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function confirmDelete(): Promise<void> {
  if (!note.value) return
  const id = note.value.id
  try {
    await notesStore.softDelete(id)
    emit('deleted', id)
  } catch {
    toast.error('Delete failed', 'Could not delete note')
  }
}
</script>

<template>
  <div v-if="loading" class="note-editor note-editor--loading">
    <span>Loading…</span>
  </div>

  <div v-else-if="note" class="note-editor">
    <!-- ── Toolbar ─────────────────────────────────────────────── -->
    <div class="note-editor__toolbar">
      <button
        type="button"
        class="note-editor__pin-btn"
        :class="{ 'note-editor__pin-btn--active': note.pinned }"
        :aria-label="note.pinned ? 'Unpin note' : 'Pin note'"
        :title="note.pinned ? 'Unpin' : 'Pin'"
        @click="togglePin"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 3v2l-1 1v5l3 2v2h-5v6l-1 1-1-1v-6H6v-2l3-2V6L8 5V3z"/>
        </svg>
        {{ note.pinned ? 'Pinned' : 'Pin' }}
      </button>

      <div class="note-editor__spacer" />

      <Button
        v-if="!deleteConfirm"
        variant="ghost"
        size="sm"
        @click="deleteConfirm = true"
      >
        Delete
      </Button>
      <template v-else>
        <span class="note-editor__confirm-text">Delete this note?</span>
        <Button variant="danger" size="sm" @click="confirmDelete">Confirm</Button>
        <Button variant="ghost" size="sm" @click="deleteConfirm = false">Cancel</Button>
      </template>
    </div>

    <!-- ── Title ──────────────────────────────────────────────── -->
    <Input
      :model-value="title"
      placeholder="Title (auto from body if empty)"
      class="note-editor__title"
      @update:model-value="onTitleInput"
    />

    <!-- ── Body ───────────────────────────────────────────────── -->
    <!-- key=note.id forces remount on note switch; Milkdown initialises once -->
    <div class="note-editor__body">
      <MilkdownEditor
        :key="note.id"
        :model-value="bodyMd"
        @update:model-value="onBodyUpdate"
      />
    </div>

    <!-- ── Task link ──────────────────────────────────────────── -->
    <div class="note-editor__section">
      <p class="note-editor__section-label">Task link</p>
      <TaskLinkPicker
        :linked-task-id="note.task_id"
        @select="onTaskLink"
      />
    </div>
  </div>

  <div v-else class="note-editor note-editor--empty">
    <p>Select a note or create a new one.</p>
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem 1.25rem;
  gap: 0.75rem;
  overflow-y: auto;
}

.note-editor--loading,
.note-editor--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.note-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.note-editor__spacer {
  flex: 1;
}

.note-editor__pin-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: color var(--motion-duration-fast), border-color var(--motion-duration-fast);
}

.note-editor__pin-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.note-editor__pin-btn--active {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.note-editor__confirm-text {
  font-size: 0.8125rem;
  color: var(--color-status-blocked);
}

.note-editor__title {
  font-size: 1rem;
  flex-shrink: 0;
}

.note-editor__body {
  flex: 1;
  min-height: 12rem;
}

.note-editor__section {
  flex-shrink: 0;
}

.note-editor__section-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
