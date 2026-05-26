import { useMediaQuery } from '@vueuse/core'

export function useIsDesktop() {
  return useMediaQuery('(min-width: 900px)')
}
