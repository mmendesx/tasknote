<script setup lang="ts">
/**
 * BoardTagFilter — horizontal chip row above board columns.
 * Reads tagsStore.list. Active tags highlighted. Toggles currentBoardStore.tagFilter.
 * Syncs to URL query param ?tag=1,2,3 via vue-router (replace, not push).
 * Clears filter when no tags are active.
 */
import { watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTagsStore } from '@/stores/tags'
import { useCurrentBoardStore } from '@/stores/currentBoard'

const props = defineProps<{
  boardId: number | null
}>()

const route   = useRoute()
const router  = useRouter()
const tagsStore      = useTagsStore()
const boardStore     = useCurrentBoardStore()

// ─── URL → store sync ─────────────────────────────────────────────────────────

function parseTagParam(raw: string | undefined): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)
}

function syncFromUrl(): void {
  const ids = parseTagParam(route.query.tag as string | undefined)
  boardStore.setTagFilter(ids)
}

onMounted(syncFromUrl)

watch(() => route.query.tag, syncFromUrl)

// ─── Store → URL sync ─────────────────────────────────────────────────────────

function pushFilterToUrl(ids: number[]): void {
  const tag = ids.length ? ids.join(',') : undefined
  router.replace({
    query: { ...route.query, tag },
  })
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function toggleTag(tagId: number): void {
  const current = boardStore.tagFilter
  const next = current.includes(tagId)
    ? current.filter((id) => id !== tagId)
    : [...current, tagId]

  boardStore.setTagFilter(next)
  pushFilterToUrl(next)
}

function clearFilter(): void {
  boardStore.setTagFilter([])
  pushFilterToUrl([])
}
</script>

<template>
  <div
    v-if="tagsStore.list.length"
    class="board-tag-filter"
    role="group"
    aria-label="Filter board by tag"
  >
    <span class="board-tag-filter__label" aria-hidden="true">Filter:</span>

    <div class="board-tag-filter__chips" role="list">
      <button
        v-for="tag in tagsStore.list"
        :key="tag.id"
        type="button"
        role="listitem"
        class="board-tag-filter__chip"
        :class="boardStore.tagFilter.includes(tag.id) && 'board-tag-filter__chip--active'"
        :aria-pressed="boardStore.tagFilter.includes(tag.id)"
        :aria-label="`Filter by tag ${tag.name}`"
        @click="toggleTag(tag.id)"
      >
        <span
          class="board-tag-filter__dot"
          :style="{ backgroundColor: tag.color }"
          aria-hidden="true"
        />
        {{ tag.name }}
      </button>
    </div>

    <button
      v-if="boardStore.tagFilter.length"
      type="button"
      class="board-tag-filter__clear"
      aria-label="Clear tag filter"
      @click="clearFilter"
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      Clear
    </button>
  </div>
</template>

<style scoped>
.board-tag-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background-color: color-mix(in srgb, var(--color-surface-elevated) 80%, transparent);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.board-tag-filter__label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.board-tag-filter__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.board-tag-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-border);
  background-color: var(--color-surface);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}

.board-tag-filter__chip:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.board-tag-filter__chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.board-tag-filter__chip--active {
  background-color: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
}

.board-tag-filter__chip--active:hover {
  background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
  color: var(--color-accent);
}

.board-tag-filter__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.board-tag-filter__clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s;
}

.board-tag-filter__clear:hover { color: var(--color-text-primary); }

.board-tag-filter__clear:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
