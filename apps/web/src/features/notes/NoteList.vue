<script setup lang="ts">

import { computed, onMounted } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { Button } from '@tasknote/ui'
import { IconPin, IconNote } from './icons'
import type { Note } from '@tasknote/shared'
import { deriveTitle, getPreview, formatRelativeTime } from './note-presentation'

const props = defineProps<{
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  deleted: [id: number]
  create: []
}>()

const notesStore = useNotesStore()

async function handleDelete(id: number): Promise<void> {
  await notesStore.softDelete(id)
  emit('deleted', id)
}

onMounted(() => {
  notesStore.load()
})

const sortedNotes = computed<Note[]>(() =>
  [...notesStore.list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
)
</script>

<template>
  <!-- Always-mounted live region: announces loading state reliably to screen readers -->
  <span class="sr-only" aria-live="polite" aria-atomic="true">
    {{ notesStore.loading ? 'Loading notes…' : '' }}
  </span>

  <ul class="note-list" aria-label="Notes">
    <!-- Loading state: CSS-only skeleton rows -->
    <template v-if="notesStore.loading">
      <li class="note-list__skeleton" aria-hidden="true">
        <span class="skeleton-line skeleton-line--title"></span>
        <span class="skeleton-line skeleton-line--preview"></span>
      </li>
      <li class="note-list__skeleton" aria-hidden="true">
        <span class="skeleton-line skeleton-line--title skeleton-line--short"></span>
        <span class="skeleton-line skeleton-line--preview"></span>
      </li>
      <li class="note-list__skeleton" aria-hidden="true">
        <span class="skeleton-line skeleton-line--title"></span>
        <span class="skeleton-line skeleton-line--preview skeleton-line--narrow"></span>
      </li>
    </template>

    <!-- Empty state -->
    <li v-else-if="!sortedNotes.length" class="note-list__empty">
      <IconNote class="note-list__empty-icon" aria-hidden="true" width="40" height="40" />
      <p class="note-list__empty-text">No notes yet — create your first one</p>
      <Button variant="primary" size="sm" @click="emit('create')">New note</Button>
    </li>

    <!-- Note rows -->
    <li
      v-else
      v-for="note in sortedNotes"
      :key="note.id"
      class="note-item"
      :class="{ 'note-item--selected': note.id === selectedId }"
    >
      <!-- FR-8c: inner button is the keyboard activator for each note item -->
      <button
        type="button"
        class="note-item__open"
        :aria-label="`Open note: ${deriveTitle(note)}`"
        :aria-current="note.id === selectedId ? 'true' : undefined"
        @click="emit('select', note.id)"
      >
        <div class="note-item__header">
          <span class="note-item__title">{{ deriveTitle(note) }}</span>
          <span
            v-if="note.pinned"
            class="note-item__pin"
            aria-label="Pinned"
            title="Pinned"
          >
            <IconPin width="12" height="12" aria-hidden="true" />
          </span>
        </div>
        <p class="note-item__preview">{{ getPreview(note) }}</p>
        <time class="note-item__time" :datetime="String(note.updated_at)">
          {{ formatRelativeTime(note.updated_at) }}
        </time>
      </button>

      <!-- Delete button is a sibling outside the open button — revealed on hover/focus-within -->
      <button
        type="button"
        class="note-item__del"
        :aria-label="`Delete note: ${deriveTitle(note)}`"
        title="Delete note"
        @click="handleDelete(note.id)"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path d="M1 3h10M4 3V2h4v1M5 5.5v3M7 5.5v3M2 3l.8 7.2A.9.9 0 0 0 3.7 11h4.6a.9.9 0 0 0 .9-.8L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </li>
  </ul>
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
.note-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2, 0.5rem);
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 0.25rem);
}

/* ── Note item (full-mode) — cards-lite ─────────────────────────────────────── */
.note-item {
  position: relative;
  border-radius: var(--radius-control, 6px);
  transition: background var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.note-item:hover,
.note-item:focus-within {
  background: var(--color-surface-elevated);
}

/* Selected: elevated bg + 2px accent left rail */
.note-item--selected {
  background: var(--color-surface-elevated);
  box-shadow: inset 2px 0 0 var(--color-accent);
}

/* ── Open button (full-width click target) ──────────────────────────────────── */
.note-item__open {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--radius-control, 6px);
  cursor: pointer;
  /* Right padding leaves room for the delete button */
  padding: 0.5rem 2.25rem 0.5rem 0.625rem;
  color: inherit;
  font: inherit;
}

.note-item__open:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
}

/* ── Row header: title + pin ────────────────────────────────────────────────── */
.note-item__header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.125rem;
}

.note-item__title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-item__pin {
  color: var(--color-accent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* ── Preview + time ─────────────────────────────────────────────────────────── */
.note-item__preview {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0 0 0.1875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-item__time {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

/* ── Delete button ──────────────────────────────────────────────────────────── */
.note-item__del {
  position: absolute;
  top: 50%;
  right: 0.375rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  /* FR-14/15: 24×24 minimum touch target */
  min-width: 24px;
  min-height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition:
    color var(--motion-duration-fast, 120ms),
    opacity var(--motion-duration-fast, 120ms),
    background-color var(--motion-duration-fast, 120ms);
}

/* Reveal on hover or keyboard focus-within */
.note-item:hover .note-item__del,
.note-item:focus-within .note-item__del {
  opacity: 1;
  pointer-events: auto;
}

/* Always visible on touch devices */
@media (hover: none) {
  .note-item__del {
    opacity: 0.6;
    pointer-events: auto;
  }
}

.note-item__del:hover {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

.note-item__del:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

/* ── Empty state ────────────────────────────────────────────────────────────── */
.note-list__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 0.75rem);
  padding: var(--space-6, 1.5rem) var(--space-4, 1rem);
  list-style: none;
}

.note-list__empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.note-list__empty-text {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
  line-height: 1.4;
}

/* ── Skeleton loading rows ──────────────────────────────────────────────────── */
@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.note-list__skeleton {
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
  width: 70%;
}

.skeleton-line--title.skeleton-line--short {
  width: 50%;
}

.skeleton-line--preview {
  height: 0.625rem;
  width: 90%;
}

.skeleton-line--preview.skeleton-line--narrow {
  width: 60%;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }

  .note-item {
    transition: none;
  }

  .note-item__del {
    transition: none;
  }
}
</style>
