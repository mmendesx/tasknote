import { ref } from 'vue'

/**
 * useSelectedTask — singleton composable tracking the currently selected task.
 *
 * Shared between:
 *   - ICT-18 (BoardView/KanbanColumn) which writes selectedTaskId on card click
 *   - ICT-19 (TaskDrawer) which reads selectedTaskId to open the correct drawer
 *   - ICT-20 (useShortcuts) which reads selectedTaskId for 'e' and del shortcuts
 *
 * Public API is intentionally minimal — just id + setter + clear.
 */

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
