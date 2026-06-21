import { ref, onMounted, onUnmounted } from 'vue'
import type { useDiagramsStore } from '@/stores/diagrams'
import { buildMovePatch } from './useSelection'
import { reanchorConnectorsForMovedShapes } from './connectors'
import type { useDrawState } from './useDrawTools'

// ── Types ─────────────────────────────────────────────────────────────────────

type Store = ReturnType<typeof useDiagramsStore>
type DrawTools = ReturnType<typeof useDrawState>

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOL_SHORTCUTS: Record<string, string> = {
  v: 'select',
  h: 'hand',
  r: 'rectangle',
  e: 'ellipse',
  o: 'ellipse',
  l: 'line',
  a: 'arrow',
  t: 'text',
  p: 'pen',
}

// Arrow-key nudge: debounced history to avoid a history entry per keystroke.
const NUDGE_HISTORY_DEBOUNCE_MS = 500

// ── Composable ────────────────────────────────────────────────────────────────

/**
 * Encapsulates keyboard handling for the diagram canvas.
 * Attaches/detaches a window keydown listener via onMounted/onUnmounted.
 */
export function useCanvasKeyboard(store: Store, drawTools: DrawTools) {
  const { cancelDraw } = drawTools
  const lastNudgeTimestamp = ref(0)

  function isTextInputFocused(): boolean {
    const active = document.activeElement
    if (!active) return false
    const tag = active.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable
  }

  function handleEscapeOrDelete(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      cancelDraw()
      store.selectElement(null)
      return true
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (isTextInputFocused()) return true
      if (store.selectedIds.length === 0) return true
      store.removeElements(store.selectedIds)
      store.selectElement(null)
      return true
    }
    return false
  }

  function handleUndoRedo(event: KeyboardEvent): boolean {
    const isMod = event.ctrlKey || event.metaKey
    if (isMod && event.key === 'z') {
      if (isTextInputFocused()) return true
      event.preventDefault()
      if (event.shiftKey) {
        store.redoAction()
      } else {
        store.undoAction()
      }
      return true
    }
    // Shift+Cmd+Z on some platforms produces uppercase Z without shiftKey flag
    if (isMod && event.key === 'Z') {
      if (isTextInputFocused()) return true
      event.preventDefault()
      store.redoAction()
      return true
    }
    return false
  }

  function handleNudge(event: KeyboardEvent): boolean {
    const isArrowKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      || event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if (!isArrowKey) return false
    if (isTextInputFocused()) return true
    if (store.selectedIds.length === 0) return true
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    const now = Date.now()
    if (now - lastNudgeTimestamp.value > NUDGE_HISTORY_DEBOUNCE_MS) {
      store.pushHistory()
    }
    lastNudgeTimestamp.value = now
    // Build all patches then apply in one batched call (FR-B8).
    const nudgePatches: Array<{ id: string; patch: ReturnType<typeof buildMovePatch> }> = []
    for (const id of store.selectedIds) {
      const original = store.elements.find((e) => e.id === id)
      if (original) {
        nudgePatches.push({ id, patch: buildMovePatch(original, dx, dy) })
      }
    }
    if (nudgePatches.length > 0) {
      const movedIds = new Set(store.selectedIds)
      const movedElements = store.elements.map((el) => {
        const p = nudgePatches.find((q) => q.id === el.id)
        return p ? { ...el, ...p.patch } : el
      })
      const connectorPatches = reanchorConnectorsForMovedShapes(movedElements, movedIds)
      store.updateElements([...nudgePatches, ...connectorPatches])
    }
    return true
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (handleEscapeOrDelete(event)) return
    if (handleUndoRedo(event)) return
    if (handleNudge(event)) return

    // Tool shortcuts: no modifier keys allowed
    const isMod = event.ctrlKey || event.metaKey
    if (isMod || event.altKey) return
    if (isTextInputFocused()) return
    const tool = TOOL_SHORTCUTS[event.key.toLowerCase()]
    if (tool) {
      store.setTool(tool)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
  })

  return { isTextInputFocused }
}
