import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Note } from '@tasknote/shared'
import type { CreateNoteDto, UpdateNoteDto } from '@tasknote/shared'

export const useNotesStore = defineStore('notes', () => {
  const list = ref<Note[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(taskId?: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      list.value = await api.notes.listNotes(taskId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load notes'
    } finally {
      loading.value = false
    }
  }

  async function create(dto: CreateNoteDto): Promise<Note> {
    loading.value = true
    error.value = null
    try {
      const note = await api.notes.createNote(dto)
      list.value.unshift(note)
      return note
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create note'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function update(id: number, dto: UpdateNoteDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const updated = await api.notes.updateNote(id, dto)
      const index = list.value.findIndex((n) => n.id === id)
      if (index !== -1) list.value[index] = updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update note'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function softDelete(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await api.notes.deleteNote(id)
      list.value = list.value.filter((n) => n.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to archive note'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * NOTE: POST /api/notes/:id/restore is not in the original spec (only tasks have restore).
   * Implemented here to mirror the task pattern; API team must add the endpoint.
   */
  async function restore(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const restored = await api.notes.restoreNote(id)
      const index = list.value.findIndex((n) => n.id === id)
      if (index !== -1) {
        list.value[index] = restored
      } else {
        list.value.push(restored)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to restore note'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { list, loading, error, load, create, update, softDelete, restore }
})
