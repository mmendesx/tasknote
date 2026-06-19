import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { TodayTask } from '@/api/tasks'

export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const useTodayStore = defineStore('today', () => {
  const list = ref<TodayTask[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadToday(today: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      list.value = await api.tasks.listToday(today)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load today tasks'
    } finally {
      loading.value = false
    }
  }

  async function commit(id: number, today: string): Promise<void> {
    try {
      await api.tasks.commitTask(id, today)
      await loadToday(today)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to commit task'
      throw err
    }
  }

  async function uncommit(id: number): Promise<void> {
    try {
      await api.tasks.uncommitTask(id)
      list.value = list.value.filter((t) => t.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to uncommit task'
      throw err
    }
  }

  async function toggleDone(id: number): Promise<void> {
    try {
      await api.tasks.completeTask(id)
      list.value = list.value.filter((t) => t.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to complete task'
      throw err
    }
  }

  /**
   * Undo a completion: reopen the task and re-commit it to `today`, then reload
   * so it reappears in correct API order. Composes existing endpoints
   * (uncompleteTask + commitTask) — no new backend surface.
   */
  async function restore(id: number, today: string): Promise<void> {
    try {
      await api.tasks.uncompleteTask(id)
      await api.tasks.commitTask(id, today)
      await loadToday(today)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to restore task'
      throw err
    }
  }

  return { list, loading, error, loadToday, commit, uncommit, toggleDone, restore }
})
