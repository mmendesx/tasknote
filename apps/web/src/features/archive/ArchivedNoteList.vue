<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from '@tasknote/ui'
import * as api from '@/api'
import type { Note } from '@tasknote/shared'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'
import { IconRestore, IconTrash } from '../../features/notes/icons'
import { deriveTitle, getPreview, formatRelativeTime } from '../../features/notes/note-presentation'

const toast = useToast()

const notes = ref<Note[]>([])
const isLoading = ref(false)
const confirmOpen = ref(false)
const selectedNote = ref<Note | null>(null)
const restoringId = ref<number | null>(null)
const deletingId = ref<number | null>(null)

async function loadNotes() {
  isLoading.value = true
  try {
    notes.value = await api.notes.listArchivedNotes()
  } catch {
    toast.error('Failed to load archived notes', 'Please try again.')
  } finally {
    isLoading.value = false
  }
}

onMounted(loadNotes)

async function restore(note: Note) {
  restoringId.value = note.id
  try {
    await api.notes.restoreNote(note.id)
    notes.value = notes.value.filter((n) => n.id !== note.id)
    toast.success('Note restored', `"${note.title || 'Untitled'}" is back in your notes.`)
  } catch {
    toast.error('Failed to restore note', 'Please try again.')
  } finally {
    restoringId.value = null
  }
}

function openDeleteConfirm(note: Note) {
  selectedNote.value = note
  confirmOpen.value = true
}

async function permanentDelete() {
  if (!selectedNote.value) return
  deletingId.value = selectedNote.value.id
  const note = selectedNote.value
  try {
    await api.notes.permanentDeleteNote(note.id)
    notes.value = notes.value.filter((n) => n.id !== note.id)
    toast.success('Note deleted', `"${note.title || 'Untitled'}" has been permanently removed.`)
  } catch {
    toast.error('Failed to delete note', 'Please try again.')
  } finally {
    deletingId.value = null
    selectedNote.value = null
  }
}
</script>

<template>
  <div>
    <!-- Always-mounted live region: announces loading state reliably to screen readers -->
    <span class="sr-only" aria-live="polite" aria-atomic="true">
      {{ isLoading ? 'Loading archived notes…' : '' }}
    </span>

    <!-- Loading state: skeleton rows -->
    <ul v-if="isLoading" class="arch-list" aria-label="Archived notes" aria-busy="true">
      <li v-for="i in 3" :key="i" class="arch-list__skeleton" aria-hidden="true">
        <span class="skeleton-line skeleton-line--title"></span>
        <span class="skeleton-line skeleton-line--preview"></span>
      </li>
    </ul>

    <!-- Empty state -->
    <p v-else-if="notes.length === 0" class="arch-list__empty">
      No archived notes.
    </p>

    <!-- Note rows -->
    <ul v-else class="arch-list" role="list" aria-label="Archived notes">
      <li
        v-for="note in notes"
        :key="note.id"
        class="arch-item"
      >
        <!-- Text content — fills available width -->
        <div class="arch-item__body">
          <span class="arch-item__title">{{ deriveTitle(note) }}</span>
          <p class="arch-item__preview">{{ getPreview(note) }}</p>
          <time class="arch-item__time" :datetime="String(note.archived_at)">
            {{ formatRelativeTime(note.archived_at) }}
          </time>
        </div>

        <!-- Action buttons — revealed on hover/focus-within -->
        <div class="arch-item__actions">
          <button
            type="button"
            class="arch-item__btn arch-item__btn--restore"
            :aria-label="`Restore note: ${deriveTitle(note)}`"
            title="Restore"
            :disabled="restoringId === note.id || deletingId === note.id"
            @click="restore(note)"
          >
            <IconRestore width="16" height="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="arch-item__btn arch-item__btn--delete"
            :aria-label="`Permanently delete note: ${deriveTitle(note)}`"
            title="Delete permanently"
            :disabled="deletingId === note.id || restoringId === note.id"
            @click="openDeleteConfirm(note)"
          >
            <IconTrash width="16" height="16" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <ConfirmDeleteDialog
      v-model:open="confirmOpen"
      :item-name="selectedNote?.title || 'Untitled note'"
      @confirm="permanentDelete"
    />
  </div>
</template>

<style scoped>
/* ── Screen-reader only utility ─────────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── List container ─────────────────────────────────────────────────────────── */
.arch-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2, 0.5rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 0.25rem);
}

/* ── Empty state ────────────────────────────────────────────────────────────── */
.arch-list__empty {
  padding: var(--space-6, 1.5rem) var(--space-4, 1rem);
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* ── Archived note item — cards-lite ────────────────────────────────────────── */
.arch-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2, 0.5rem);
  border-radius: var(--radius-control, 6px);
  padding: 0.5rem 0.625rem;
  transition: background var(--motion-duration-fast, 120ms) ease;
}

.arch-item:hover,
.arch-item:focus-within {
  background: var(--color-surface-elevated);
}

/* ── Text body ──────────────────────────────────────────────────────────────── */
.arch-item__body {
  flex: 1;
  min-width: 0;
  /* Right padding reserves space for two action buttons */
  padding-right: 0.25rem;
}

.arch-item__title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 0.125rem;
}

.arch-item__preview {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0 0 0.1875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arch-item__time {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

/* ── Action buttons wrapper ─────────────────────────────────────────────────── */
.arch-item__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1, 0.25rem);
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-duration-fast, 120ms) ease;
}

/* Reveal on hover or keyboard focus-within */
.arch-item:hover .arch-item__actions,
.arch-item:focus-within .arch-item__actions {
  opacity: 1;
  pointer-events: auto;
}

/* Always visible on touch devices */
@media (hover: none) {
  .arch-item__actions {
    opacity: 0.7;
    pointer-events: auto;
  }
}

/* ── Individual action button ───────────────────────────────────────────────── */
.arch-item__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  transition:
    color var(--motion-duration-fast, 120ms),
    background-color var(--motion-duration-fast, 120ms);
}

.arch-item__btn:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.arch-item__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Restore button */
.arch-item__btn--restore {
  color: var(--color-text-muted);
}

.arch-item__btn--restore:hover:not(:disabled) {
  color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

/* Permanent-delete button — danger red on hover */
.arch-item__btn--delete {
  color: var(--color-text-muted);
}

.arch-item__btn--delete:hover:not(:disabled) {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

/* ── Skeleton loading rows ──────────────────────────────────────────────────── */
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.arch-list__skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--radius-control, 6px);
  list-style: none;
}

.skeleton-line {
  display: block;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    var(--color-border, rgba(128, 128, 128, 0.15)) 25%,
    var(--color-surface-elevated, rgba(128, 128, 128, 0.25)) 50%,
    var(--color-border, rgba(128, 128, 128, 0.15)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  height: 0.75rem;
  width: 65%;
}

.skeleton-line--preview {
  height: 0.625rem;
  width: 85%;
}
</style>
