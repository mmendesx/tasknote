<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { Diagram } from '@tasknote/shared'

const props = defineProps<{
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  deleted: [id: number]
}>()

const diagramsStore = useDiagramsStore()

async function handleDelete(id: number): Promise<void> {
  await diagramsStore.removeDiagram(id)
  emit('deleted', id)
}

onMounted(() => {
  diagramsStore.loadList()
})

const sortedDiagrams = computed<Diagram[]>(() =>
  [...diagramsStore.list].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  ),
)
</script>

<template>
  <ul class="diagram-list" aria-label="Diagrams">
    <li
      v-for="diagram in sortedDiagrams"
      :key="diagram.id"
      class="diagram-item"
      :class="{ 'diagram-item--selected': diagram.id === selectedId }"
    >
      <button
        type="button"
        class="diagram-item__open"
        :aria-label="`Open diagram: ${diagram.title || 'Untitled'}`"
        :aria-current="diagram.id === selectedId ? 'true' : undefined"
        @click="emit('select', diagram.id)"
      >
        <span class="diagram-item__title">{{ diagram.title || 'Untitled' }}</span>
      </button>

      <!-- Delete button is a sibling outside the open button — revealed on hover/focus-within -->
      <button
        type="button"
        class="diagram-item__del"
        :aria-label="`Delete diagram: ${diagram.title || 'Untitled'}`"
        title="Delete diagram"
        @click="handleDelete(diagram.id)"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path
            d="M1 3h10M4 3V2h4v1M5 5.5v3M7 5.5v3M2 3l.8 7.2A.9.9 0 0 0 3.7 11h4.6a.9.9 0 0 0 .9-.8L10 3"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </li>

    <li v-if="diagramsStore.loading" class="diagram-list__empty">Loading…</li>
    <li v-else-if="!sortedDiagrams.length" class="diagram-list__empty">No diagrams yet</li>
  </ul>
</template>

<style scoped>
.diagram-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.diagram-item {
  position: relative;
  border-bottom: 1px solid var(--color-border);
  transition: background var(--motion-duration-fast);
}

.diagram-item:hover,
.diagram-item:focus-within {
  background: var(--color-surface-elevated);
}

.diagram-item__open {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.625rem 2.5rem 0.625rem 0.75rem;
  color: inherit;
  font: inherit;
}

.diagram-item__open:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
}

.diagram-item--selected {
  background: var(--color-surface-elevated);
  border-left: 2px solid var(--color-text-muted);
}

.diagram-item__title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-item__del {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: color var(--motion-duration-fast), opacity var(--motion-duration-fast),
    background-color var(--motion-duration-fast);
}

.diagram-item:hover .diagram-item__del,
.diagram-item:focus-within .diagram-item__del {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .diagram-item__del {
    opacity: 0.6;
    pointer-events: auto;
  }
}

.diagram-item__del:hover {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

.diagram-item__del:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.diagram-list__empty {
  padding: 1rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
