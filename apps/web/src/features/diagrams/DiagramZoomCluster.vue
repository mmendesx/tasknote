<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramsStore } from '@/stores/diagrams'
import { IconZoomOut, IconZoomIn, IconUndo, IconRedo } from './icons'
import './diagram-chrome.css'

// ── Store ─────────────────────────────────────────────────────────────────────

const store = useDiagramsStore()

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

// ── Computed ──────────────────────────────────────────────────────────────────

const zoomPercent = computed(() => `${Math.round(store.viewport.zoom * 100)}%`)

// ── Actions ───────────────────────────────────────────────────────────────────

function zoomAroundCenter(newZoom: number): void {
  const { zoom, scrollX, scrollY } = store.viewport
  const { width, height } = store.canvasSize

  if (width === 0 || height === 0) {
    store.setViewport({ scrollX, scrollY, zoom: newZoom })
    return
  }

  const cx = width / 2
  const cy = height / 2
  const scene = { x: cx / zoom - scrollX, y: cy / zoom - scrollY }
  store.setViewport({
    scrollX: cx / newZoom - scene.x,
    scrollY: cy / newZoom - scene.y,
    zoom: newZoom,
  })
}

function zoomOut(): void {
  const newZoom = Math.max(MIN_ZOOM, store.viewport.zoom / 1.1)
  zoomAroundCenter(newZoom)
}

function zoomIn(): void {
  const newZoom = Math.min(MAX_ZOOM, store.viewport.zoom * 1.1)
  zoomAroundCenter(newZoom)
}

function resetZoom(): void {
  zoomAroundCenter(1)
}
</script>

<template>
  <div
    class="diagram-zoom-cluster diagram-floating-chrome"
    role="group"
    aria-label="Zoom and history controls"
  >
    <!-- Zoom controls -->
    <button
      class="diagram-zoom-cluster__btn focus-ring"
      aria-label="Zoom out"
      title="Zoom out"
      @click="zoomOut"
    >
      <IconZoomOut aria-hidden="true" />
    </button>

    <button
      class="diagram-zoom-cluster__zoom-label focus-ring"
      aria-label="Reset zoom to 100%"
      title="Reset zoom to 100%"
      @click="resetZoom"
    >
      {{ zoomPercent }}
    </button>

    <button
      class="diagram-zoom-cluster__btn focus-ring"
      aria-label="Zoom in"
      title="Zoom in"
      @click="zoomIn"
    >
      <IconZoomIn aria-hidden="true" />
    </button>

    <div class="diagram-zoom-cluster__divider" aria-hidden="true" />

    <!-- History controls -->
    <button
      class="diagram-zoom-cluster__btn focus-ring"
      aria-label="Undo"
      title="Undo"
      :disabled="!store.canUndo"
      @click="store.undoAction()"
    >
      <IconUndo aria-hidden="true" />
    </button>

    <button
      class="diagram-zoom-cluster__btn focus-ring"
      aria-label="Redo"
      title="Redo"
      :disabled="!store.canRedo"
      @click="store.redoAction()"
    >
      <IconRedo aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.diagram-zoom-cluster {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
}

.diagram-zoom-cluster__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition:
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.diagram-zoom-cluster__btn:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  color: var(--color-text-primary);
}

.diagram-zoom-cluster__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.diagram-zoom-cluster__zoom-label {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 28px;
  padding: 0 6px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-size: var(--text-xs, 0.75rem);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.diagram-zoom-cluster__zoom-label:hover {
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  color: var(--color-text-primary);
}

.diagram-zoom-cluster__divider {
  width: 1px;
  height: 18px;
  background-color: var(--color-border);
  margin: 0 2px;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .diagram-zoom-cluster__btn,
  .diagram-zoom-cluster__zoom-label {
    transition: none;
  }
}
</style>

<style>
@import './diagram-chrome.css';
</style>
