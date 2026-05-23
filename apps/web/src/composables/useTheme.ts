import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tasknote-theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

// Module-level singleton so all callers share the same reactive ref.
// Initialised from localStorage so data-theme is set before any component mounts.
const theme = ref<Theme>(readStoredTheme())

// Apply immediately on module load (before Pinia or any component exists)
document.documentElement.dataset.theme = theme.value

/**
 * useTheme — reactive theme state with localStorage persistence.
 *
 * After settings load, App.vue (or the onboarding flow) calls setTheme() with
 * the value from the settings store, which syncs this ref and persists to
 * localStorage. This composable never imports the store directly — that would
 * create a circular dependency and would execute before createPinia() runs.
 *
 * Public API: { theme, setTheme, toggleTheme } — stable across ICTs.
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
