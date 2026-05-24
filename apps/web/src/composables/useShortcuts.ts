import { watch } from 'vue'
import { useMagicKeys, createEventHook } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useBoardsStore } from '@/stores/boards'
import { useCurrentBoardStore } from '@/stores/currentBoard'
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
 * Must be called inside setup(). Call install() from onMounted.
 * All inject()-based composables are called here (setup time), not inside install().
 */
export function useShortcuts() {
  // All composables that use inject() must be called here — inside setup()
  const router = useRouter()
  const boardsStore = useBoardsStore()
  const currentBoardStore = useCurrentBoardStore()
  const { selectedTaskId } = useSelectedTask()
  const { openPalette } = useCommandPalette()
  const keys = useMagicKeys()

  function install() {
    if (installed) return
    installed = true

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
        const firstCol = currentBoardStore.board?.columns[0]
        if (firstCol) {
          currentBoardStore.createTask(firstCol.id, {
            title: 'New task',
            priority: 'low',
            column_id: firstCol.id,
          })
          triggerShortcut('quick-add')
        }
      }
    )

    // ─── cmd/ctrl+K: command palette ──────────────────────────────────────
    watch(
      () => (keys['Meta+k']?.value || keys['Ctrl+k']?.value),
      (active) => {
        if (!active) return
        openPalette()
        triggerShortcut('command-palette')
      }
    )

    // ─── ?: cheatsheet ─────────────────────────────────────────────────────
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

    // ─── g prefix ─────────────────────────────────────────────────────────
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
