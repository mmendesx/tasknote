<script setup lang="ts">
/**
 * NotesView — full-width notes editor at /notes and /notes/:id.
 * The NoteList is rendered in the sidebar via DefaultLayout.
 * This view owns only the editor pane and the "New note" toolbar action.
 */
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, useToast } from '@tasknote/ui'
import NoteEditor from '@/features/notes/NoteEditor.vue'
import { useNotesStore } from '@/stores/notes'

const router = useRouter()
const route = useRoute()
const notesStore = useNotesStore()
const toast = useToast()

// Selected note id is driven by the URL param
const selectedId = computed<number | null>(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  const parsed = id ? parseInt(id, 10) : NaN
  return isNaN(parsed) ? null : parsed
})

async function createNote(): Promise<void> {
  try {
    const note = await notesStore.create({ body_md: '', title: '' })
    router.push({ name: 'note-detail', params: { id: note.id } })
  } catch {
    toast.error('Failed to create note', 'Please try again.')
  }
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
    <!-- ── Toolbar ────────────────────────────────────────────────── -->
    <div class="notes-view__toolbar" role="toolbar" aria-label="Notes actions">
      <Button variant="primary" size="sm" @click="createNote">
        + New note
      </Button>
    </div>

    <!-- ── Editor ────────────────────────────────────────────────── -->
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
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.notes-view__toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.notes-view__editor {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
