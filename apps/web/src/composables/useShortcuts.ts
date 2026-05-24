import { watch } from 'vue'
import { useMagicKeys, createEventHook } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useBoardsStore } from '@/stores/boards'
import { useFocusedColumn } from '@/composables/useFocusedColumn'
import { useSelectedTask } from '@/composables/useSelectedTask'
import { useCommandPalette } from '@/features/search/useCommandPalette'

// ─── Shortcut names ────────────────────────────────────────────────────────────

export type ShortcutName =
  | 'quick-add'       // n: focus inline new-task input in focused column
  | 'command-palette' // cmd/ctrl+K: open command palette
  | 'cheatsheet'      // ?: open shortcut cheatsheet modal
  | 'edit-task'       // e: open drawer for currently selected task
  | 'archive-task'    // del/backspace: archive currently selected task
  | 'go-notes'        // g n: navigate to /notes
  | 'go-boards'       // g b: navigate to / (default board)

// ─── Singleton event hooks — one per shortcut name ────────────────────────────

const hooks = new Map<ShortcutName, ReturnType<typeof createEventHook<void>>>()

function getHook(name: ShortcutName) {
  if (!hooks.has(name)) {
    hooks.set(name, createEventHook<void>())
  }
  return hooks.get(name)!
}

/**
 * Register a handler for a named shortcut.
 * Returns the unsubscribe function.
 *
 * Can be called before install() — handlers are registered on the hook and
 * will fire once the shortcut layer is active.
 */
export function onShortcut(name: ShortcutName, handler: () => void): () => void {
  const hook = getHook(name)
  const { off } = hook.on(handler)
  return off
}

/**
 * Programmatically trigger a named shortcut (fires all registered handlers).
 */
export function triggerShortcut(name: ShortcutName): void {
  getHook(name).trigger()
}

// ─── Input focus guard ─────────────────────────────────────────────────────────

/**
 * Returns true when the active element is a text input.
 * cmd/ctrl+K bypasses this guard (always fires).
 */
function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = (el as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

// ─── Singleton install guard ───────────────────────────────────────────────────

let installed = false

/**
 * useShortcuts — singleton composable for the global keyboard shortcut layer.
 *
 * Call install() once from App.vue onMounted. All shortcut registrations
 * happen inside install() — components subscribe via onShortcut() instead.
 *
 * Shortcuts registered:
 *   n             → 'quick-add'       blocked in inputs; requires focused column
 *   cmd/ctrl+K    → 'command-palette' always fires (opens CommandPalette)
 *   ?             → 'cheatsheet'      blocked in inputs
 *   e             → 'edit-task'       blocked in inputs; requires selected task
 *   del/backspace → 'archive-task'    blocked in inputs; requires selected task
 *   1..9          → board jump        blocked in inputs; sorted by position
 *   g n           → 'go-notes'        blocked in inputs
 *   g b           → 'go-boards'       blocked in inputs
 *
 * g-prefix state machine: pressing 'g' sets pendingG=true for 750ms.
 * If 'n' or 'b' is pressed within that window, the combo fires. Otherwise
 * 'n' behaves as quick-add and 'b' is ignored.
 */
export function useShortcuts() {
  function install() {
    if (installed) return
    installed = true

    const router = useRouter()
    const boardsStore = useBoardsStore()
    const { focusedColumnId, activateQuickAdd } = useFocusedColumn()
    const { selectedTaskId } = useSelectedTask()
    const { openPalette } = useCommandPalette()

    const keys = useMagicKeys()

    // ─── g-prefix state machine ────────────────────────────────────────────
    let pendingG = false
    let pendingGTimer: ReturnType<typeof setTimeout> | null = null

    function setPendingG(value: boolean) {
      pendingG = value
      if (pendingGTimer !== null) {
        clearTimeout(pendingGTimer)
        pendingGTimer = null
      }
      if (value) {
        pendingGTimer = setTimeout(() => {
          pendingG = false
          pendingGTimer = null
        }, 750)
      }
    }

    function cancelPendingG() {
      setPendingG(false)
    }

    // ─── n: quick-add OR g+n: go to notes ─────────────────────────────────
    watch(
      () => keys['n']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        if (pendingG) {
          cancelPendingG()
          router.push('/notes')
          triggerShortcut('go-notes')
          return
        }
        // Standalone 'n': activate quick-add if a column is focused
        if (focusedColumnId.value !== null) {
          activateQuickAdd(focusedColumnId.value)
          triggerShortcut('quick-add')
        }
      }
    )

    // ─── cmd/ctrl+K: command palette (always fires) ────────────────────────
    watch(
      () => (keys['Meta+k']?.value || keys['Ctrl+k']?.value),
      (active) => {
        if (!active) return
        openPalette()
        triggerShortcut('command-palette')
      }
    )

    // ─── ?: cheatsheet ─────────────────────────────────────────────────────
    // useMagicKeys tracks KeyboardEvent.key values directly, so '?' works
    // on US keyboard layouts (Shift+/) without explicit Shift handling.
    watch(
      () => keys['?']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        triggerShortcut('cheatsheet')
      }
    )

    // ─── e: edit selected task ─────────────────────────────────────────────
    watch(
      () => keys['e']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        if (pendingG) return
        if (selectedTaskId.value !== null) {
          triggerShortcut('edit-task')
        }
      }
    )

    // ─── del / backspace: archive selected task ────────────────────────────
    watch(
      [() => keys['Delete']?.value, () => keys['Backspace']?.value],
      ([del, bsp]) => {
        if (!del && !bsp) return
        if (isInputFocused()) return
        if (selectedTaskId.value !== null) {
          triggerShortcut('archive-task')
        }
      }
    )

    // ─── 1..9: jump to board by position ──────────────────────────────────
    // Boards are sorted by `position` field (ascending).
    // '1' = first board (index 0), '9' = ninth board (index 8).
    const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

    for (const digit of DIGIT_KEYS) {
      watch(
        () => keys[digit]?.value,
        (active) => {
          if (!active) return
          if (isInputFocused()) return
          if (pendingG) return
          const index = parseInt(digit, 10) - 1
          const sorted = [...boardsStore.list].sort((a, b) => a.position - b.position)
          const target = sorted[index]
          if (target) {
            router.push(`/b/${target.id}`)
          }
        }
      )
    }

    // ─── g prefix — set pendingG on keydown ───────────────────────────────
    watch(
      () => keys['g']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        setPendingG(true)
      }
    )

    // ─── g b: go to boards ─────────────────────────────────────────────────
    watch(
      () => keys['b']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        if (pendingG) {
          cancelPendingG()
          router.push('/')
          triggerShortcut('go-boards')
        }
      }
    )
  }

  return { install }
}
