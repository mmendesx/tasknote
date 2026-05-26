import { ref } from 'vue'

const selectedTaskId = ref<number | null>(null)

export function useSelectedTask() {
  function selectTask(id: number | null): void {
    selectedTaskId.value = id
  }

  function clearSelection(): void {
    selectedTaskId.value = null
  }

  return { selectedTaskId, selectTask, clearSelection }
}
