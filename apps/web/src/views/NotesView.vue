<script setup lang="ts">
/**
 * NotesView — two-pane notes layout at /notes and /notes/:id.
 * Left: 320px NoteList. Right: NoteEditor (or empty state).
 * URL param :id keeps editor in sync with router.
 */
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button } from '@tasknote/ui'
import NoteList from '@/features/notes/NoteList.vue'
import NoteEditor from '@/features/notes/NoteEditor.vue'
import { useNotesStore } from '@/stores/notes'

const router = useRouter()
const route = useRoute()
const notesStore = useNotesStore()

// Selected note id is driven by the URL param
const selectedId = computed<number | null>(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  const parsed = id ? parseInt(id, 10) : NaN
  return isNaN(parsed) ? null : parsed
})

function selectNote(id: number): void {
  router.push({ name: 'note-detail', params: { id } })
}

async function createNote(): Promise<void> {
  const note = await notesStore.create({ body_md: '', title: '' })
  router.push({ name: 'note-detail', params: { id: note.id } })
}

function handleDeleted(id: number): void {
  // If the deleted note is currently selected, go back to /notes
  if (selectedId.value === id) {
    router.push({ name: 'notes' })
  }
}
</script>

<template>
  <div class="notes-view">
    <!-- ── Left panel: list ───────────────────────────────────────── -->
    <aside class="notes-view__sidebar" aria-label="Notes list">
      <div class="notes-view__sidebar-header">
        <h1 class="notes-view__heading">Notes</h1>
        <Button variant="primary" size="sm" @click="createNote">
          + New note
        </Button>
      </div>
      <NoteList
        :selected-id="selectedId"
        @select="selectNote"
      />
    </aside>

    <!-- ── Right panel: editor ───────────────────────────────────── -->
    <main class="notes-view__editor" aria-label="Note editor">
      <NoteEditor
        :note-id="selectedId"
        @deleted="handleDeleted"
      />
    </main>
  </div>
</template>

<style scoped>
.notes-view {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.notes-view__sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
}

.notes-view__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.75rem 0.625rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.notes-view__heading {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.notes-view__editor {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg);
}

/* ── Responsive: below 640px stack vertically ─────────────────── */
@media (max-width: 639px) {
  .notes-view {
    flex-direction: column;
  }

  .notes-view__sidebar {
    width: 100%;
    height: 40%;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .notes-view__editor {
    height: 60%;
  }
}
</style>
