import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Note } from '@tasknote/shared'
import type { CreateNoteDto, UpdateNoteDto } from '@tasknote/shared'

export const useNotesStore = defineStore('notes', () => {
  // Global notes list — used by NotesView (no taskId scope)
  const globalList = ref<Note[]>([])
  // Per-task notes — keyed by taskId, used by TaskDrawer
  const byTask = ref(new Map<number, Note[]>())

  const loading = ref(false)
  const creating = ref(false)
  const error = ref<string | null>(null)

  // Alias so existing consumers of `list` continue to work (maps to globalList)
  const list = globalList

  // Abort the previous in-flight load for the SAME scope when a new one
  // starts. Keyed per scope (global vs per-task) because a global load and a
  // per-task load are independent and may legitimately run concurrently.
  const loadAborts = new Map<number | 'global', AbortController>()

  /**
   * load() — no arg: populates globalList only.
   * load(taskId) — populates byTask.get(taskId) only, never touches globalList.
   */
  async function load(taskId?: number): Promise<void> {
    const scope = taskId ?? 'global'
    loadAborts.get(scope)?.abort()
    const ctrl = new AbortController()
    loadAborts.set(scope, ctrl)
    loading.value = true
    error.value = null
    try {
      const notes = await api.notes.listNotes(taskId, ctrl.signal)
      if (taskId === undefined) {
        globalList.value = notes
      } else {
        byTask.value = new Map(byTask.value)
        byTask.value.set(taskId, notes)
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      error.value = err instanceof Error ? err.message : 'Failed to load notes'
    } finally {
      if (loadAborts.get(scope) === ctrl) {
        loading.value = false
        loadAborts.delete(scope)
      }
    }
  }

  /** Returns the note list for a specific task (empty array if not yet loaded). */
  function forTask(taskId: number): Note[] {
    return byTask.value.get(taskId) ?? []
  }

  async function create(dto: CreateNoteDto): Promise<Note> {
    creating.value = true
    error.value = null
    try {
      const note = await api.notes.createNote(dto)
      // Add to globalList if not task-scoped
      if (!dto.task_id) {
        globalList.value.unshift(note)
      } else {
        // Patch the task's slot if it's loaded
        const existing = byTask.value.get(dto.task_id)
        if (existing) {
          const updated = new Map(byTask.value)
          updated.set(dto.task_id, [note, ...existing])
          byTask.value = updated
        }
      }
      return note
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create note'
      throw err
    } finally {
      creating.value = false
    }
  }

  async function update(id: number, dto: UpdateNoteDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const updated = await api.notes.updateNote(id, dto)
      // Patch globalList
      const gi = globalList.value.findIndex((n) => n.id === id)
      if (gi !== -1) globalList.value[gi] = updated
      // Patch byTask slots — build once, assign once
      const newMap = new Map(byTask.value)
      for (const [taskId, notes] of newMap) {
        const idx = notes.findIndex((n) => n.id === id)
        if (idx !== -1) {
          const copy = [...notes]
          copy[idx] = updated
          newMap.set(taskId, copy)
        }
      }
      byTask.value = newMap
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
      globalList.value = globalList.value.filter((n) => n.id !== id)
      // Remove from all byTask slots
      const newMap = new Map<number, Note[]>()
      for (const [taskId, notes] of byTask.value) {
        newMap.set(taskId, notes.filter((n) => n.id !== id))
      }
      byTask.value = newMap
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to archive note'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function restore(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const restored = await api.notes.restoreNote(id)
      const index = globalList.value.findIndex((n) => n.id === id)
      if (index !== -1) {
        globalList.value[index] = restored
      } else {
        globalList.value.push(restored)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to restore note'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { list, globalList, byTask, loading, creating, error, load, forTask, create, update, softDelete, restore }
})
