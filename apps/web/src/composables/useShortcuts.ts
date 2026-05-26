import { watch } from 'vue'
import { useMagicKeys, createEventHook } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useBoardsStore } from '@/stores/boards'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { useSelectedTask } from '@/composables/useSelectedTask'
import { useCommandPalette } from '@/features/search/useCommandPalette'

export type ShortcutName =
  | 'quick-add'       
  | 'command-palette' 
  | 'cheatsheet'      
  | 'edit-task'       
  | 'archive-task'    
  | 'go-notes'        
  | 'go-boards'       

const hooks = new Map<ShortcutName, ReturnType<typeof createEventHook<void>>>()

function getHook(name: ShortcutName) {
  if (!hooks.has(name)) {
    hooks.set(name, createEventHook<void>())
  }
  return hooks.get(name)!
}

export function onShortcut(name: ShortcutName, handler: () => void): () => void {
  const hook = getHook(name)
  const { off } = hook.on(handler)
  return off
}

export function triggerShortcut(name: ShortcutName): void {
  getHook(name).trigger()
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = (el as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

let installed = false

export function useShortcuts() {
  
  const router = useRouter()
  const boardsStore = useBoardsStore()
  const currentBoardStore = useCurrentBoardStore()
  const { selectedTaskId } = useSelectedTask()
  const { openPalette } = useCommandPalette()
  const keys = useMagicKeys()

  function install() {
    if (installed) return
    installed = true

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

    watch(
      () => (keys['Meta+k']?.value || keys['Ctrl+k']?.value),
      (active) => {
        if (!active) return
        openPalette()
        triggerShortcut('command-palette')
      }
    )

    watch(
      () => keys['?']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        triggerShortcut('cheatsheet')
      }
    )

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

    watch(
      () => keys['g']?.value,
      (active) => {
        if (!active) return
        if (isInputFocused()) return
        setPendingG(true)
      }
    )

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
