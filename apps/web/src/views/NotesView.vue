<script setup lang="ts">

import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, useToast } from '@tasknote/ui'
import NoteEditor from '@/features/notes/NoteEditor.vue'
import NoteList from '@/features/notes/NoteList.vue'
import { IconBack } from '@/features/notes/icons'
import { useNotesStore } from '@/stores/notes'

const router = useRouter()
const route = useRoute()
const notesStore = useNotesStore()
const toast = useToast()

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
  if (selectedId.value === id) {
    router.push({ name: 'notes' })
  }
}

function handleSelect(id: number): void {
  router.push({ name: 'note-detail', params: { id } })
}

function navigateBack(): void {
  router.push({ name: 'notes' })
}
</script>

<template>
  <div class="notes-view">
    <Teleport to="#topbar-actions-portal">
      <Button variant="primary" size="sm" @click="createNote">
        + New note
      </Button>
    </Teleport>

    <!-- Wide layout: two-pane grid (≥900px) -->
    <div class="notes-view__layout">
      <!-- List pane: always visible on wide, only visible on narrow when no note is selected -->
      <aside
        class="notes-view__list-pane"
        :class="{ 'notes-view__list-pane--hidden': selectedId !== null }"
        aria-label="Notes list"
      >
        <NoteList
          :selected-id="selectedId"
          @create="createNote"
          @select="handleSelect"
          @deleted="handleDeleted"
        />
      </aside>

      <!-- Editor pane: always visible on wide, only visible on narrow when a note is selected -->
      <main
        class="notes-view__editor-pane"
        :class="{ 'notes-view__editor-pane--hidden': selectedId === null }"
        aria-label="Note editor"
      >
        <!-- Back affordance: only shown on mobile (hidden via CSS on wide viewport) -->
        <button
          v-if="selectedId !== null"
          type="button"
          class="notes-view__back"
          aria-label="Back to notes list"
          @click="navigateBack"
        >
          <IconBack width="18" height="18" aria-hidden="true" />
          <span>Notes</span>
        </button>

        <NoteEditor
          :note-id="selectedId"
          @create="createNote"
          @deleted="handleDeleted"
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.notes-view {
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.notes-view__layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  height: 100%;
  overflow: hidden;
}

.notes-view__list-pane {
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  height: 100%;
  background: var(--color-bg);
}

.notes-view__editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.notes-view__back {
  display: none;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--color-accent, var(--color-text-primary));
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border);
  width: 100%;
  text-align: left;
  flex-shrink: 0;
}

.notes-view__back:hover {
  background: var(--color-surface-elevated);
}

.notes-view__back:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
}

/* Narrow layout: single pane, <900px */
@media (max-width: 899px) {
  .notes-view__layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }

  .notes-view__list-pane {
    border-right: none;
    grid-column: 1;
    grid-row: 1;
  }

  .notes-view__editor-pane {
    grid-column: 1;
    grid-row: 1;
  }

  /* Hide list pane when a note is selected on narrow viewport */
  .notes-view__list-pane--hidden {
    display: none;
  }

  /* Hide editor pane when no note is selected on narrow viewport */
  .notes-view__editor-pane--hidden {
    display: none;
  }

  /* Show back button on narrow viewport */
  .notes-view__back {
    display: flex;
  }
}
</style>
