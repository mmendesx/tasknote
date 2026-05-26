import { useMediaQuery } from '@vueuse/core'

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
