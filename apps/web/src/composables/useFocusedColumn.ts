import { ref } from 'vue'

/**
 * useFocusedColumn — singleton composable tracking the focused Kanban column.
 *
 * Used by:
 *   - ICT-18 (KanbanColumn) writes focusedColumnId on click/focus
 *   - ICT-20 (useShortcuts) reads focusedColumnId to route 'n' shortcut,
 *     and sets quickAddActiveColumnId to activate QuickAddTaskInput
 *
 * Contract for ICT-18 KanbanColumn integration:
 *   - Call focusColumn(column.id) on click inside the column
 *   - Bind :active="quickAddActiveColumnId === column.id" on QuickAddTaskInput
 *   - Handle @submit and @cancel from QuickAddTaskInput:
 *     @submit: call currentBoardStore.createTask(columnId, { title, priority: 'medium', column_id: columnId })
 *     @cancel: call clearQuickAdd()
 */

const focusedColumnId = ref<number | null>(null)
const quickAddActiveColumnId = ref<number | null>(null)

export function useFocusedColumn() {
  function focusColumn(id: number | null): void {
    focusedColumnId.value = id
  }

  function activateQuickAdd(columnId: number): void {
    quickAddActiveColumnId.value = columnId
  }

  function clearQuickAdd(): void {
    quickAddActiveColumnId.value = null
  }

  return {
    focusedColumnId,
    quickAddActiveColumnId,
    focusColumn,
    activateQuickAdd,
    clearQuickAdd,
  }
}
