import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tasknote-theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

// Module-level singleton so all callers share the same reactive ref
const theme = ref<Theme>(readStoredTheme())

// Apply immediately on module load (before any component mounts)
document.documentElement.dataset.theme = theme.value

/**
 * useTheme — provides reactive theme state with localStorage persistence.
 *
 * Later ICTs will migrate this ref into the Pinia settings store (ICT-16).
 * At that point this composable will read from and write to the store instead.
 * The public API (theme, setTheme, toggleTheme) stays the same.
 */
export function useTheme() {
  watch(theme, (next) => {
    document.documentElement.dataset.theme = next
    localStorage.setItem(STORAGE_KEY, next)
  })

  function setTheme(next: Theme) {
    theme.value = next
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, setTheme, toggleTheme }
}
