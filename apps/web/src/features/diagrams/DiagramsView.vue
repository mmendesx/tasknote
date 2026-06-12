<script setup lang="ts">

import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, useToast } from '@tasknote/ui'
import { useDiagramsStore } from '@/stores/diagrams'
import DiagramCanvas from './DiagramCanvas.vue'
import DiagramToolbar from './DiagramToolbar.vue'
import DiagramStylePanel from './DiagramStylePanel.vue'
import DiagramToolPalette from './DiagramToolPalette.vue'
import DiagramZoomCluster from './DiagramZoomCluster.vue'

const router = useRouter()
const route = useRoute()
const diagramsStore = useDiagramsStore()
const toast = useToast()

// ── Selected diagram ID from route ────────────────────────────────────────────

const selectedId = computed<number | null>(() => {
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  const parsed = id ? parseInt(id, 10) : NaN
  return isNaN(parsed) ? null : parsed
})

// ── List ──────────────────────────────────────────────────────────────────────

onMounted(() => {
  if (selectedId.value === null) {
    diagramsStore.loadList()
  }
})

// ── Create ────────────────────────────────────────────────────────────────────

const isCreating = ref(false)

async function createDiagram(): Promise<void> {
  if (isCreating.value) return
  isCreating.value = true
  try {
    const diagram = await diagramsStore.createDiagram()
    router.push({ name: 'diagram-detail', params: { id: diagram.id } })
  } catch {
    toast.error('Failed to create diagram', 'Please try again.')
  } finally {
    isCreating.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

const isPendingDelete = ref(false)

async function deleteDiagram(): Promise<void> {
  const id = selectedId.value
  if (id === null) return
  try {
    await diagramsStore.removeDiagram(id)
    router.push({ name: 'diagrams' })
  } catch {
    toast.error('Failed to delete diagram', 'Please try again.')
  } finally {
    isPendingDelete.value = false
  }
}

function requestDelete(): void {
  isPendingDelete.value = true
}

function cancelDelete(): void {
  isPendingDelete.value = false
}

// ── Save-error toast (one per failure episode) ────────────────────────────────

let saveErrorEpisodeActive = false

watch(
  () => diagramsStore.saveError,
  (current, previous) => {
    if (current !== null && previous === null && !saveErrorEpisodeActive) {
      saveErrorEpisodeActive = true
      toast.error('Autosave failed', 'Retrying in the background…')
    }
    if (current === null) {
      saveErrorEpisodeActive = false
    }
  },
)
</script>

<template>
  <div class="diagrams-view">
    <!-- Teleport the primary action into the topbar portal -->
    <Teleport to="#topbar-actions-portal">
      <Button
        variant="primary"
        size="sm"
        :disabled="isCreating"
        @click="createDiagram"
      >
        + New diagram
      </Button>
    </Teleport>

    <!-- Detail view: diagram canvas + toolbar -->
    <template v-if="selectedId !== null">
      <div class="diagrams-view__detail">
        <div class="diagrams-view__detail-header">
          <DiagramToolbar />
          <div class="diagrams-view__delete-zone">

            <template v-if="isPendingDelete">
              <button
                class="diagrams-view__btn diagrams-view__btn--danger focus-ring"
                aria-label="Confirm delete diagram"
                @click="deleteDiagram"
              >
                Confirm delete
              </button>
              <button
                class="diagrams-view__btn focus-ring"
                aria-label="Cancel delete diagram"
                @click="cancelDelete"
              >
                Cancel
              </button>
            </template>
            <button
              v-else
              class="diagrams-view__btn diagrams-view__btn--delete focus-ring"
              aria-label="Delete diagram"
              @click="requestDelete"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path
                  d="M2 4h12M5 4V3h6v1M6 7v4M10 7v4M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Delete
            </button>
          </div>
        </div>
        <DiagramStylePanel />
        <main class="diagrams-view__canvas" aria-label="Diagram canvas area">
          <DiagramCanvas :diagram-id="selectedId" />
          <DiagramToolPalette class="diagrams-view__tool-palette" />
          <DiagramZoomCluster class="diagrams-view__zoom-cluster" />
        </main>
      </div>
    </template>

    <!-- List view: loading / error / empty / populated -->
    <template v-else>
      <main class="diagrams-view__list" aria-label="Diagrams list">

        <!-- Loading state -->
        <div
          v-if="diagramsStore.loading"
          class="diagrams-view__state"
          aria-live="polite"
        >
          <span class="diagrams-view__spinner" aria-hidden="true" />
          <p class="diagrams-view__state-text">Loading diagrams…</p>
        </div>

        <!-- Error state -->
        <div
          v-else-if="diagramsStore.listError"
          class="diagrams-view__state"
          role="alert"
        >
          <p class="diagrams-view__state-text diagrams-view__state-text--error">
            {{ diagramsStore.listError }}
          </p>
          <button
            class="diagrams-view__btn focus-ring"
            @click="diagramsStore.loadList()"
          >
            Retry
          </button>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="diagramsStore.list.length === 0"
          class="diagrams-view__state"
        >
          <p class="diagrams-view__state-text">No diagrams yet</p>
          <button
            class="diagrams-view__btn diagrams-view__btn--primary focus-ring"
            :disabled="isCreating"
            @click="createDiagram"
          >
            + New diagram
          </button>
        </div>

        <!-- Populated state -->
        <ul
          v-else
          class="diagrams-view__grid"
          aria-label="Your diagrams"
        >
          <li
            v-for="diagram in diagramsStore.list"
            :key="diagram.id"
            class="diagrams-view__card"
          >
            <button
              class="diagrams-view__card-btn focus-ring"
              :aria-label="`Open diagram: ${diagram.title || 'Untitled diagram'}`"
              @click="router.push({ name: 'diagram-detail', params: { id: diagram.id } })"
            >
              <span class="diagrams-view__card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                  <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.5" />
                  <path d="M7 9h4M7 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </span>
              <span class="diagrams-view__card-title">
                {{ diagram.title || 'Untitled diagram' }}
              </span>
            </button>
          </li>
        </ul>

      </main>
    </template>
  </div>
</template>

<style scoped>
.diagrams-view {
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

/* ── Detail view ─────────────────────────────────────────────────────────── */

.diagrams-view__detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.diagrams-view__detail-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.diagrams-view__delete-zone {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  flex-shrink: 0;
}

.diagrams-view__canvas {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.diagrams-view__tool-palette {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.diagrams-view__zoom-cluster {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 10;
}

/* ── List view ───────────────────────────────────────────────────────────── */

.diagrams-view__list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* ── Shared state container ───────────────────────────────────────────────── */

.diagrams-view__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
  color: var(--color-text-secondary);
  text-align: center;
}

.diagrams-view__state-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.diagrams-view__state-text--error {
  color: var(--color-status-blocked);
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */

.diagrams-view__spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: diagrams-spin 0.7s linear infinite;
}

@keyframes diagrams-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .diagrams-view__spinner {
    animation: none;
  }
}

/* ── Grid of diagram cards ────────────────────────────────────────────────── */

.diagrams-view__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.diagrams-view__card {
  display: contents;
}

.diagrams-view__card-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--motion-duration-fast) var(--motion-easing),
    border-color var(--motion-duration-fast) var(--motion-easing);
}

.diagrams-view__card-btn:hover {
  background: var(--color-surface-elevated);
  border-color: var(--color-accent);
}

.diagrams-view__card-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.diagrams-view__card-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* ── Action buttons ──────────────────────────────────────────────────────── */

.diagrams-view__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  transition:
    background-color var(--motion-duration-fast) var(--motion-easing),
    color var(--motion-duration-fast) var(--motion-easing);
}

.diagrams-view__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  color: var(--color-text-primary);
}

.diagrams-view__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.diagrams-view__btn--primary {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.diagrams-view__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 85%, #000);
  color: #fff;
}

.diagrams-view__btn--delete {
  color: var(--color-text-muted);
}

.diagrams-view__btn--delete:hover:not(:disabled) {
  color: var(--color-status-blocked);
  background: color-mix(in srgb, var(--color-status-blocked) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-status-blocked) 40%, transparent);
}

.diagrams-view__btn--danger {
  color: var(--color-status-blocked);
  border-color: color-mix(in srgb, var(--color-status-blocked) 40%, transparent);
}

.diagrams-view__btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-status-blocked) 15%, transparent);
}
</style>
