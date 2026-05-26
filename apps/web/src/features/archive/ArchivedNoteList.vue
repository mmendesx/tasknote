<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button, useToast } from '@tasknote/ui'
import * as api from '@/api'
import type { Note } from '@tasknote/shared'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.vue'

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

function formatDate(date: Date | string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div>
    
    <div v-if="isLoading" class="space-y-2" aria-live="polite" aria-busy="true">
      <div
        v-for="i in 3"
        :key="i"
        class="h-16 rounded-control bg-surface animate-pulse"
        aria-hidden="true"
      />
    </div>

    <div
      v-else-if="notes.length === 0"
      class="py-16 text-center text-text-muted text-sm"
    >
      No archived notes.
    </div>

    <ul v-else class="space-y-2" role="list">
      <li
        v-for="note in notes"
        :key="note.id"
        class="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3"
      >
        
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-text-primary">
            {{ note.title || 'Untitled note' }}
          </p>
          <p class="mt-0.5 text-xs text-text-muted">
            Archived {{ formatDate(note.archived_at) }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            :loading="restoringId === note.id"
            :disabled="deletingId === note.id"
            @click="restore(note)"
          >
            Restore
          </Button>
          <Button
            variant="danger"
            size="sm"
            :loading="deletingId === note.id"
            :disabled="restoringId === note.id"
            @click="openDeleteConfirm(note)"
          >
            Delete permanently
          </Button>
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
