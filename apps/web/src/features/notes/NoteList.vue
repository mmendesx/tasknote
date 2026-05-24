<script setup lang="ts">
/**
 * NoteList — left-panel list of all notes, ordered pinned-first then updated_at desc.
 * Emits 'select' with the note id when a row is clicked.
 */
import { computed, onMounted } from 'vue'
import { useTimeAgo } from '@vueuse/core'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@tasknote/shared'

const props = defineProps<{
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  deleted: [id: number]
}>()

const notesStore = useNotesStore()

async function handleDelete(id: number): Promise<void> {
  await notesStore.softDelete(id)
  emit('deleted', id)
}

onMounted(() => {
  notesStore.load()
})

// Pinned first (desc), then updated_at desc
const sortedNotes = computed<Note[]>(() =>
  [...notesStore.list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
)

function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[>*-]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

function deriveTitle(note: Note): string {
  if (note.title) return note.title
  const body = note.body_md ?? ''
  const firstHeading = body.match(/^#{1,6}\s+(.+)$/m)
  if (firstHeading) return firstHeading[1].trim()
  const firstLine = body.split('\n').find((l) => l.trim())
  return firstLine ? stripMarkdown(firstLine).slice(0, 60) || 'Untitled' : 'Untitled'
}

function getPreview(note: Note): string {
  return stripMarkdown(note.body_md ?? '').slice(0, 80)
}
</script>

<template>
  <ul class="note-list" role="listbox" aria-label="Notes">
    <li
      v-for="note in sortedNotes"
      :key="note.id"
      role="option"
      :aria-selected="note.id === selectedId"
      class="note-item"
      :class="{ 'note-item--selected': note.id === selectedId }"
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16 3v2l-1 1v5l3 2v2h-5v6l-1 1-1-1v-6H6v-2l3-2V6L8 5V3z"/>
          </svg>
        </span>
        <button
          class="note-item__del"
          aria-label="Delete note"
          title="Delete note"
          @click.stop="handleDelete(note.id)"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M1 3h10M4 3V2h4v1M5 5.5v3M7 5.5v3M2 3l.8 7.2A.9.9 0 0 0 3.7 11h4.6a.9.9 0 0 0 .9-.8L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <p class="note-item__preview">{{ getPreview(note) }}</p>
      <time class="note-item__time" :datetime="String(note.updated_at)">
        {{ useTimeAgo(new Date(note.updated_at)).value }}
      </time>
    </li>

    <li v-if="notesStore.loading" class="note-list__empty">Loading…</li>
    <li v-else-if="!sortedNotes.length" class="note-list__empty">No notes yet.</li>
  </ul>
</template>

<style scoped>
.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.note-item {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background var(--motion-duration-fast);
}

.note-item:hover {
  background: var(--color-surface-elevated);
}

.note-item--selected {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  border-left: 2px solid var(--color-accent);
}

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
}

.note-item__del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
  transition: color var(--motion-duration-fast), opacity var(--motion-duration-fast), background-color var(--motion-duration-fast);
}

.note-item:hover .note-item__del {
  opacity: 1;
}

.note-item__del:hover {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

.note-item__preview {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-item__time {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.note-list__empty {
  padding: 1rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
