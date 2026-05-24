import { ref } from 'vue'

/**
 * Singleton composable that owns the open/closed state of the command palette.
 * ICT-20 (useShortcuts) will call openPalette() via its cmd-k handler.
 */
const open = ref(false)

export function useCommandPalette() {
  function openPalette(): void {
    open.value = true
  }

  function closePalette(): void {
    open.value = false
  }

  return { open, openPalette, closePalette }
}
