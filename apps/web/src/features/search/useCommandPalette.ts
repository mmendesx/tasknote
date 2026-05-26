import { ref } from 'vue'

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
