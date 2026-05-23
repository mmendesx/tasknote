import { useMediaQuery } from '@vueuse/core'

/**
 * useReducedMotion — reactive boolean reflecting the OS preference for
 * reduced motion. Returns true when the user has requested less motion.
 *
 * This is the single source of truth consumed by useAnime and any
 * component that needs to branch on animation behavior.
 */
export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
