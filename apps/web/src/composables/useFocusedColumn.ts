import { ref } from 'vue'

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
