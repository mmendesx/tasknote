import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tasknote-theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

const theme = ref<Theme>(readStoredTheme())

document.documentElement.dataset.theme = theme.value

// Module-scoped watcher: one for the whole app. Registering it inside
// useTheme() created one (component-disposed) watcher per caller, each doing
// identical DOM/localStorage writes.
watch(theme, (next) => {
  document.documentElement.dataset.theme = next
  localStorage.setItem(STORAGE_KEY, next)
})

export function useTheme() {
  function setTheme(next: Theme) {
    theme.value = next
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, setTheme, toggleTheme }
}
