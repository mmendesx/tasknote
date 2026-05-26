<script setup lang="ts">

import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, useToast } from '@tasknote/ui'
import NoteEditor from '@/features/notes/NoteEditor.vue'
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
</script>

<template>
  <div class="notes-view">
    <Teleport to="#topbar-actions-portal">
      <Button variant="primary" size="sm" @click="createNote">
        + New note
      </Button>
    </Teleport>

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
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.notes-view__editor {
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
