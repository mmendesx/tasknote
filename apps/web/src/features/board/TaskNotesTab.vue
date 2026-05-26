<script setup lang="ts">

import { ref } from 'vue'
import { Button, Input } from '@tasknote/ui'
import { useToast } from '@tasknote/ui'
import MilkdownEditor from './MilkdownEditor.vue'
import { useNotesStore } from '@/stores/notes'
import type { Note } from '@tasknote/shared'

const props = defineProps<{
  taskId: number
  notes: Note[]
}>()

const notesStore = useNotesStore()
const toast = useToast()

const expandedNoteId = ref<number | null>(null)
const newNoteTitle   = ref('')
const newNoteBody    = ref('')
const creatingNote   = ref(false)
const showForm       = ref(false)

async function createNote(): Promise<void> {
  if (!newNoteBody.value.trim()) return
  creatingNote.value = true
  try {
    await notesStore.create({
      task_id: props.taskId,
      title:   newNoteTitle.value.trim() || undefined,
      body_md: newNoteBody.value.trim(),
    })
    newNoteTitle.value = ''
    newNoteBody.value  = ''
    showForm.value = false
  } catch {
    toast.error('Note failed', 'Could not create note')
  } finally {
    creatingNote.value = false
  }
}

async function unlinkNote(noteId: number): Promise<void> {
  try {
    await notesStore.update(noteId, { task_id: null })
  } catch {
    toast.error('Unlink failed', 'Could not unlink note')
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <ul v-if="notes.length" class="flex flex-col gap-2 list-none m-0 p-0">
      <li
        v-for="note in notes"
        :key="note.id"
        class="rounded-control border border-border bg-surface p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <button
            type="button"
            class="flex-1 text-left text-sm font-medium text-text-primary hover:text-accent
                   focus-visible:outline-none focus-visible:underline"
            @click="expandedNoteId = expandedNoteId === note.id ? null : note.id"
          >
            {{ note.title || note.body_md.slice(0, 60) || 'Untitled' }}
          </button>
          <Button size="sm" variant="ghost" @click="unlinkNote(note.id)">Unlink</Button>
        </div>
        <div v-if="expandedNoteId === note.id" class="mt-2">
          <MilkdownEditor :model-value="note.body_md" :read-only="true" />
        </div>
      </li>
    </ul>
    <p v-else-if="!showForm" class="text-sm text-text-muted">No notes linked to this task.</p>

    <template v-if="showForm">
      <div class="flex flex-col gap-3 border border-border rounded-control p-3">
        <Input v-model="newNoteTitle" label="Title (optional)" placeholder="Note title" />
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-text-secondary">Body</label>
          <MilkdownEditor v-model="newNoteBody" />
        </div>
        <div class="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            :loading="creatingNote"
            :disabled="!newNoteBody.trim()"
            @click="createNote"
          >
            Create & link
          </Button>
          <Button variant="ghost" size="sm" @click="showForm = false">Cancel</Button>
        </div>
      </div>
    </template>
    <template v-else>
      <Button variant="secondary" size="sm" @click="showForm = true">
        + Link new note
      </Button>
    </template>
  </div>
</template>
