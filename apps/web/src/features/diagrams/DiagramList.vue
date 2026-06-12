<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Button } from '@tasknote/ui'
import { useDiagramsStore } from '@/stores/diagrams'
import { IconTrash, IconDiagramEmpty } from './icons'
import type { Diagram } from '@tasknote/shared'

const props = defineProps<{
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  deleted: [id: number]
}>()

const diagramsStore = useDiagramsStore()

// ── Relative time ─────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60)
    return `${m}m ago`
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600)
    return `${h}h ago`
  }
  if (diffSec < 86400 * 30) {
    const d = Math.floor(diffSec / 86400)
    return `${d}d ago`
  }
  if (diffSec < 86400 * 365) {
    const mo = Math.floor(diffSec / (86400 * 30))
    return `${mo}mo ago`
  }
  const y = Math.floor(diffSec / (86400 * 365))
  return `${y}y ago`
}

// ── Rename state ──────────────────────────────────────────────────────────────

const editingId = ref<number | null>(null)
const editingTitle = ref('')
const renameInputRef = ref<HTMLInputElement[]>([])

async function startRename(diagram: Diagram): Promise<void> {
  editingId.value = diagram.id
  editingTitle.value = diagram.title
  await nextTick()
  const input = renameInputRef.value[0]
  input?.focus()
  input?.select()
}

async function saveRename(): Promise<void> {
  if (editingId.value === null) return
  const id = editingId.value
  editingId.value = null
  await diagramsStore.renameDiagram(id, editingTitle.value)
}

function cancelRename(): void {
  editingId.value = null
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function handleDelete(id: number): Promise<void> {
  await diagramsStore.removeDiagram(id)
  emit('deleted', id)
}

// ── List ──────────────────────────────────────────────────────────────────────

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
  <!-- Loading state -->
  <div v-if="diagramsStore.loading" class="diagram-list__status" aria-live="polite">
    Loading…
  </div>

  <!-- Empty state -->
  <div v-else-if="!sortedDiagrams.length" class="diagram-list__empty">
    <IconDiagramEmpty
      class="diagram-list__empty-icon"
      width="48"
      height="48"
      aria-hidden="true"
    />
    <p class="diagram-list__empty-prompt">No diagrams yet — create your first one</p>
    <Button variant="primary" size="sm" @click="emit('select', 0)">New diagram</Button>
  </div>

  <!-- Card grid -->
  <ul v-else class="diagram-grid" aria-label="Diagrams">
    <li
      v-for="diagram in sortedDiagrams"
      :key="diagram.id"
      class="diagram-card"
      :class="{ 'diagram-card--selected': diagram.id === selectedId }"
    >
      <!-- Rename input mode -->
      <input
        v-if="editingId === diagram.id"
        ref="renameInputRef"
        v-model="editingTitle"
        class="diagram-card__rename-input focus-ring"
        type="text"
        maxlength="100"
        aria-label="Rename diagram"
        @keydown.enter.stop="saveRename"
        @keydown.escape.stop="cancelRename"
        @blur="saveRename"
      />

      <!-- Normal card face -->
      <template v-else>
        <!-- Open button covers the entire card surface -->
        <button
          type="button"
          class="diagram-card__open focus-ring"
          :aria-label="`Open diagram: ${diagram.title || 'Untitled'}`"
          :aria-current="diagram.id === selectedId ? 'true' : undefined"
          @click="emit('select', diagram.id)"
        >
          <span class="diagram-card__title">{{ diagram.title || 'Untitled' }}</span>
          <span class="diagram-card__meta">{{ formatRelativeTime(diagram.updated_at) }}</span>
        </button>

        <!-- Delete button — revealed on card hover/focus-within -->
        <div class="diagram-card__actions">
          <button
            type="button"
            class="diagram-card__rename-btn focus-ring"
            :aria-label="`Rename ${diagram.title || 'Untitled'}`"
            title="Rename diagram"
            @click.stop="startRename(diagram)"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path
                d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="diagram-card__delete-btn focus-ring"
            :aria-label="`Delete ${diagram.title || 'Untitled'}`"
            title="Delete diagram"
            @click.stop="handleDelete(diagram.id)"
          >
            <IconTrash width="16" height="16" aria-hidden="true" />
          </button>
        </div>
      </template>
    </li>
  </ul>
</template>

<style scoped>
/* ── Grid ──────────────────────────────────────────────────────────────────── */

.diagram-grid {
  list-style: none;
  margin: 0;
  padding: var(--space-4);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
  overflow-y: auto;
  align-content: start;
}

/* ── Card ─────────────────────────────────────────────────────────────────── */

.diagram-card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  transition:
    box-shadow var(--motion-duration-fast) var(--motion-easing),
    border-color var(--motion-duration-fast) var(--motion-easing);
  overflow: hidden;
  min-height: 96px;
}

.diagram-card:hover,
.diagram-card:focus-within {
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-bg) 30%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
}

.diagram-card--selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

/* ── Open button (full card hit-target) ───────────────────────────────────── */

.diagram-card__open {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  min-height: 96px;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
  /* Extend to fill card before actions overlay */
  padding-right: calc(var(--space-4) + 56px);
}

.diagram-card__open:focus-visible {
  outline: none; /* handled via .focus-ring below */
}

/* ── Card content ─────────────────────────────────────────────────────────── */

.diagram-card__title {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-card__meta {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* ── Actions (hover/focus-within reveal) ─────────────────────────────────── */

.diagram-card__actions {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-duration-fast) var(--motion-easing);
}

.diagram-card:hover .diagram-card__actions,
.diagram-card:focus-within .diagram-card__actions {
  opacity: 1;
  pointer-events: auto;
}

/* Touch devices: always show */
@media (hover: none) {
  .diagram-card__actions {
    opacity: 0.7;
    pointer-events: auto;
  }
}

.diagram-card__rename-btn,
.diagram-card__delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition:
    color var(--motion-duration-fast),
    background-color var(--motion-duration-fast);
}

.diagram-card__rename-btn:hover {
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
}

.diagram-card__delete-btn:hover {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

/* ── Rename input ─────────────────────────────────────────────────────────── */

.diagram-card__rename-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: var(--color-surface);
  border: 1px solid var(--color-focus-ring);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  font: inherit;
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  outline: none;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

.diagram-list__status {
  padding: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
}

.diagram-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.diagram-list__empty-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.diagram-list__empty-prompt {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ── Focus ring utility (applied via class on interactive elements) ──────── */

.focus-ring:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
</style>
