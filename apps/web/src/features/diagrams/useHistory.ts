import { ref, computed } from 'vue'
import type { DiagramElement } from '@tasknote/shared'

const MAX_HISTORY = 50

/**
 * Pure non-Pinia composable managing undo/redo stacks for diagram elements.
 *
 * @param getCurrentElements - getter that returns the current live elements;
 *   called by push() to capture the pre-mutation snapshot.
 */
export function useHistory(getCurrentElements: () => DiagramElement[]) {
  const undoStack = ref<DiagramElement[][]>([])
  const redoStack = ref<DiagramElement[][]>([])

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  /**
   * Snapshot the CURRENT state (before a mutation) onto the undo stack.
   * Clears the redo stack and enforces the 50-entry cap.
   */
  function push(snapshot: DiagramElement[]): void {
    const next = [snapshot, ...undoStack.value]
    undoStack.value = next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next
    redoStack.value = []
  }

  /**
   * Undo: pop the most recent snapshot from the undo stack, push the current
   * state onto the redo stack, and return the snapshot to restore.
   * Returns null when there is nothing to undo.
   */
  function undo(): DiagramElement[] | null {
    if (undoStack.value.length === 0) return null

    const [restoredState, ...remainingUndo] = undoStack.value
    redoStack.value = [getCurrentElements(), ...redoStack.value]
    undoStack.value = remainingUndo
    return restoredState
  }

  /**
   * Redo: pop the most recent snapshot from the redo stack, push the current
   * state back onto the undo stack, and return the snapshot to restore.
   * Returns null when there is nothing to redo.
   */
  function redo(): DiagramElement[] | null {
    if (redoStack.value.length === 0) return null

    const [restoredState, ...remainingRedo] = redoStack.value
    undoStack.value = [getCurrentElements(), ...undoStack.value]
    redoStack.value = remainingRedo
    return restoredState
  }

  /**
   * Clear both stacks — call this when a new diagram is loaded so history
   * from a previous editing session does not leak.
   */
  function clear(): void {
    undoStack.value = []
    redoStack.value = []
  }

  /**
   * Discard the most recent undo entry without touching redo.
   * Used exclusively by the pointer-cancel path: after a cancelled gesture we
   * restore the original geometry, leaving the live elements identical to the
   * snapshot that was pushed at gesture start. The entry would therefore be a
   * no-op duplicate — remove it so that undo goes to the state before the
   * gesture, not to an identical copy of the current state.
   */
  function discardLast(): void {
    if (undoStack.value.length === 0) return
    const [, ...remaining] = undoStack.value
    undoStack.value = remaining
  }

  return {
    canUndo,
    canRedo,
    push,
    undo,
    redo,
    clear,
    discardLast,
  }
}
