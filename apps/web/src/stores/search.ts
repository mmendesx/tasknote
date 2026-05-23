import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { SearchResponse } from '@tasknote/shared'

const DEBOUNCE_MS = 300

export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const results = ref<SearchResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function runSearch(q: string): Promise<void> {
    if (!q.trim()) {
      results.value = null
      loading.value = false
      return
    }

    loading.value = true
    error.value = null
    try {
      results.value = await api.search.search(q)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Search failed'
      results.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * Set the search query and debounce the API call by 300ms.
   * An empty query clears results immediately without hitting the API.
   */
  function setQuery(q: string): void {
    query.value = q

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (!q.trim()) {
      results.value = null
      loading.value = false
      return
    }

    loading.value = true
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      runSearch(q)
    }, DEBOUNCE_MS)
  }

  function clear(): void {
    setQuery('')
  }

  return { query, results, loading, error, setQuery, clear }
})
