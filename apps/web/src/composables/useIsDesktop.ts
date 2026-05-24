import { useMediaQuery } from '@vueuse/core'

/**
 * useIsDesktop — reactive boolean, true when viewport is ≥900px.
 * Single source of truth for desktop-only DnD and handle visibility.
 */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 900px)')
}
