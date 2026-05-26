import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tasknote-theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

const theme = ref<Theme>(readStoredTheme())

document.documentElement.dataset.theme = theme.value

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
