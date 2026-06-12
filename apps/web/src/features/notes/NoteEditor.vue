<script setup lang="ts">

import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button, useToast } from '@tasknote/ui'
import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'
import TaskLinkPicker from './TaskLinkPicker.vue'
import { IconPin, IconNote, IconTrash } from './icons'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@tasknote/shared'

const props = defineProps<{
  noteId: number | null
}>()

const emit = defineEmits<{
  deleted: [id: number]
  create: []
}>()

const router = useRouter()
const notesStore = useNotesStore()
const toast = useToast()

const note = ref<Note | null>(null)
const title = ref('')
const bodyMd = ref('')
const loading = ref(false)
const deleteConfirm = ref(false)

function deriveTitleClient(md: string): string {
  const heading = md.match(/^#{1,6}\s+(.+)$/m)
  if (heading?.[1]) return heading[1].trim()
  const line = md.split('\n').find((l) => l.trim())
  return line
    ? line.replace(/^[#*>\-]+\s*/, '').trim().slice(0, 60) || 'Untitled'
    : 'Untitled'
}

const displayTitle = computed(() =>
  title.value || (note.value ? deriveTitleClient(note.value.body_md) : '')
)

watch(
  () => props.noteId,
  async (id) => {
    if (!id) { note.value = null; return }
    deleteConfirm.value = false
    loading.value = true
    try {
      const cached = notesStore.list.find((n) => n.id === id)
      if (cached) {
        note.value = cached
        title.value = cached.title
        bodyMd.value = cached.body_md
      } else {
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

const isSaving = ref(false)

const isDirty = computed(() => {
  if (!note.value) return false
  return title.value !== note.value.title || bodyMd.value !== note.value.body_md
})

const saveIndicatorState = computed<'saved' | 'saving' | 'unsaved'>(() => {
  if (isSaving.value) return 'saving'
  if (isDirty.value) return 'unsaved'
  return 'saved'
})

const saveLabel = computed(() => {
  if (isSaving.value) return 'Saving…'
  if (isDirty.value) return 'Unsaved'
  return 'Saved'
})

function onTitleInput(e: Event): void {
  title.value = (e.target as HTMLInputElement).value
}
function onBodyUpdate(val: string): void { bodyMd.value = val }

async function saveNote(): Promise<void> {
  if (!note.value || isSaving.value) return
  if (!isDirty.value) {
    toast.success('No changes', 'Nothing to save')
    return
  }
  isSaving.value = true
  try {
    await notesStore.update(note.value.id, {
      title: title.value,
      body_md: bodyMd.value,
    })
    const updated = notesStore.list.find((n) => n.id === note.value!.id)
    if (updated) note.value = updated
    toast.success('Saved', 'Note updated')
  } catch {
    toast.error('Save failed', 'Could not save note')
  } finally {
    isSaving.value = false
  }
}

function discardNoteChanges(): void {
  if (!note.value) return
  title.value = note.value.title
  bodyMd.value = note.value.body_md
}

async function togglePin(): Promise<void> {
  if (!note.value) return
  const next = !note.value.pinned
  try {
    await notesStore.update(note.value.id, { pinned: next })
    const updated = notesStore.list.find((n) => n.id === note.value!.id)
    if (updated) note.value = updated
  } catch {
    toast.error('Pin failed', 'Could not update pin status')
  }
}

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

async function confirmDelete(): Promise<void> {
  if (!note.value) return
  const id = note.value.id
  try {
    await notesStore.softDelete(id)
    emit('deleted', id)
    router.push('/notes')
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

    <!-- Header row: borderless title + right cluster -->
    <div class="note-editor__header">
      <input
        :value="displayTitle"
        type="text"
        class="note-editor__title-input"
        placeholder="Untitled"
        aria-label="Note title"
        @input="onTitleInput"
      />

      <div class="note-editor__header-cluster">
        <!-- Pin toggle -->
        <button
          type="button"
          class="note-editor__icon-btn"
          :class="{ 'note-editor__icon-btn--accent': note.pinned }"
          :aria-label="note.pinned ? 'Unpin note' : 'Pin note'"
          :aria-pressed="note.pinned"
          :title="note.pinned ? 'Unpin' : 'Pin'"
          @click="togglePin"
        >
          <IconPin width="16" height="16" aria-hidden="true" />
        </button>

        <!-- Save-status indicator -->
        <span
          class="note-editor__save-indicator"
          :class="`note-editor__save-indicator--${saveIndicatorState}`"
          aria-live="polite"
          aria-atomic="true"
        >
          <span class="note-editor__save-dot" aria-hidden="true" />
          <span :class="{ 'note-editor__save-label--italic': saveIndicatorState === 'unsaved' }">
            {{ saveLabel }}
          </span>
        </span>

        <!-- Save button -->
        <Button
          variant="primary"
          size="sm"
          :disabled="!isDirty || isSaving"
          @click="saveNote"
        >
          Save
        </Button>

        <!-- Discard button -->
        <button
          v-if="!deleteConfirm"
          type="button"
          class="note-editor__icon-btn"
          :disabled="!isDirty"
          aria-label="Discard changes"
          title="Discard changes"
          @click="discardNoteChanges"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Delete button / inline confirm -->
        <template v-if="!deleteConfirm">
          <button
            type="button"
            class="note-editor__icon-btn note-editor__icon-btn--danger-hover"
            aria-label="Delete note"
            title="Delete note"
            @click="deleteConfirm = true"
          >
            <IconTrash width="16" height="16" aria-hidden="true" />
          </button>
        </template>
        <template v-else>
          <span class="note-editor__confirm-text">Delete note?</span>
          <Button variant="ghost" size="sm" @click="deleteConfirm = false">Cancel</Button>
          <Button variant="danger" size="sm" @click="confirmDelete">Delete</Button>
        </template>
      </div>
    </div>

    <div class="note-editor__body">
      <MilkdownEditor
        :key="note.id"
        :model-value="bodyMd"
        @update:model-value="onBodyUpdate"
      />
    </div>

    <div class="note-editor__section">
      <p class="note-editor__section-label">Task link</p>
      <TaskLinkPicker
        :linked-task-id="note.task_id ?? null"
        @select="onTaskLink"
      />
    </div>
  </div>

  <!-- Empty state: no note selected -->
  <div v-else class="note-editor note-editor--empty">
    <div class="note-editor__empty-content">
      <IconNote
        width="40"
        height="40"
        class="note-editor__empty-icon"
        aria-hidden="true"
      />
      <p class="note-editor__empty-prompt">Select or create a note</p>
      <Button variant="primary" size="sm" @click="emit('create')">
        New note
      </Button>
    </div>
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
  gap: var(--space-3, 0.75rem);
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

/* ── Empty state ─────────────────────────────────────────────────────────── */

.note-editor__empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 0.75rem);
  text-align: center;
}

.note-editor__empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.note-editor__empty-prompt {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

/* ── Header row ──────────────────────────────────────────────────────────── */

.note-editor__header {
  display: flex;
  align-items: center;
  gap: var(--space-3, 0.75rem);
  flex-shrink: 0;
  min-height: 2.25rem;
}

.note-editor__title-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  padding: 0;
  line-height: 1.4;
}

.note-editor__title-input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

/* ── Right cluster ───────────────────────────────────────────────────────── */

.note-editor__header-cluster {
  display: flex;
  align-items: center;
  gap: var(--space-2, 0.5rem);
  flex-shrink: 0;
}

/* ── Icon buttons ────────────────────────────────────────────────────────── */

.note-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-control, 0.375rem);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color var(--motion-duration-fast, 120ms),
    background-color var(--motion-duration-fast, 120ms);
}

.note-editor__icon-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, currentColor 8%, transparent);
}

.note-editor__icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.note-editor__icon-btn--accent {
  color: var(--color-accent);
}

.note-editor__icon-btn--accent:hover:not(:disabled) {
  color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.note-editor__icon-btn--danger-hover:hover:not(:disabled) {
  color: var(--color-status-blocked, #dc2626);
  background-color: color-mix(in srgb, var(--color-status-blocked, #dc2626) 10%, transparent);
}

/* ── Save indicator ──────────────────────────────────────────────────────── */

.note-editor__save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-xs, 0.75rem);
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 6ch;
}

.note-editor__save-indicator--saving,
.note-editor__save-indicator--unsaved {
  color: var(--color-accent);
}

.note-editor__save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  flex-shrink: 0;
}

.note-editor__save-indicator--saving .note-editor__save-dot {
  animation: note-save-pulse 1.2s ease-in-out infinite;
}

@keyframes note-save-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .note-editor__save-indicator--saving .note-editor__save-dot {
    animation: none;
  }
}

.note-editor__save-label--italic {
  font-style: italic;
}

/* ── Inline delete confirm ───────────────────────────────────────────────── */

.note-editor__confirm-text {
  font-size: 0.8125rem;
  color: var(--color-status-blocked, #dc2626);
  white-space: nowrap;
}

/* ── Body + sections ─────────────────────────────────────────────────────── */

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
