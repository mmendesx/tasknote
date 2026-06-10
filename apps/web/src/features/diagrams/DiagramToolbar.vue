<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '@tasknote/ui'
import { useDiagramsStore } from '@/stores/diagrams'
import { exportSvg, exportPng } from './exportDiagram'

const store = useDiagramsStore()
const toast = useToast()

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

// ── Tool list (value + label only; icons are inline in template) ──────────────

const tools = [
  { value: 'select',    label: 'Select' },
  { value: 'hand',      label: 'Hand (pan)' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'ellipse',   label: 'Ellipse' },
  { value: 'line',      label: 'Line' },
  { value: 'arrow',     label: 'Arrow' },
  { value: 'text',      label: 'Text' },
  { value: 'pen',       label: 'Pen' },
] as const

type ToolValue = (typeof tools)[number]['value']

// ── Zoom computed ─────────────────────────────────────────────────────────────

const zoomPercent = computed(() => `${Math.round(store.viewport.zoom * 100)}%`)

// ── Save indicator computed ──────────────────────────────────────────────────

const saveLabel = computed(() => {
  if (store.saveError) return 'Save failed — retrying'
  if (store.saving) return 'Saving…'
  if (!store.dirty) return 'Saved'
  return 'Unsaved'
})

// ── Actions ───────────────────────────────────────────────────────────────────

function selectTool(value: ToolValue): void {
  store.setTool(value)
}

function zoomAroundCenter(newZoom: number): void {
  const { zoom, scrollX, scrollY } = store.viewport
  const { width, height } = store.canvasSize

  // Guard: canvas not yet measured — fall back to fixed-scroll behavior.
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

function zoomIn(): void {
  const newZoom = Math.min(MAX_ZOOM, store.viewport.zoom * 1.1)
  zoomAroundCenter(newZoom)
}

function zoomOut(): void {
  const newZoom = Math.max(MIN_ZOOM, store.viewport.zoom / 1.1)
  zoomAroundCenter(newZoom)
}

function resetZoom(): void {
  zoomAroundCenter(1)
}

// ── Export helpers ────────────────────────────────────────────────────────────

function resolveCanvasColor(): string {
  try {
    return getComputedStyle(document.body).color || '#1f2937'
  } catch {
    return '#1f2937'
  }
}

function resolveCanvasBg(): string {
  try {
    return getComputedStyle(document.body).backgroundColor || '#ffffff'
  } catch {
    return '#ffffff'
  }
}

function handleExportSvg(): void {
  exportSvg(store.elements, store.title ?? 'diagram', resolveCanvasColor())
}

async function handleExportPng(): Promise<void> {
  try {
    await exportPng(store.elements, store.title ?? 'diagram', resolveCanvasColor(), resolveCanvasBg())
  } catch {
    toast.error('PNG export failed', 'Could not rasterize the diagram. Try again.')
  }
}

const hasElements = computed(() => store.elements.length > 0)
</script>

<template>
  <div class="diagram-toolbar" aria-label="Diagram tools">

    <!-- Tool buttons -->
    <div class="diagram-toolbar__group" role="group" aria-label="Drawing tools">

      <!-- Select -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'select' }"
        aria-label="Select (V)"
        title="Select (V)"
        :aria-pressed="store.tool === 'select'"
        @click="selectTool('select')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 2l10 6-5 1.5L6 14z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Hand -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'hand' }"
        aria-label="Hand (pan) (H)"
        title="Hand (pan) (H)"
        :aria-pressed="store.tool === 'hand'"
        @click="selectTool('hand')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M8 2v5M6 4V2M4 5V3M10 4V2M12 5v2l.5 4.5A1.5 1.5 0 0 1 11 13H7a2 2 0 0 1-2-2V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Rectangle -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'rectangle' }"
        aria-label="Rectangle (R)"
        title="Rectangle (R)"
        :aria-pressed="store.tool === 'rectangle'"
        @click="selectTool('rectangle')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>

      <!-- Ellipse -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'ellipse' }"
        aria-label="Ellipse (E)"
        title="Ellipse (E)"
        :aria-pressed="store.tool === 'ellipse'"
        @click="selectTool('ellipse')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <ellipse cx="8" cy="8" rx="6" ry="4" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>

      <!-- Line -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'line' }"
        aria-label="Line (L)"
        title="Line (L)"
        :aria-pressed="store.tool === 'line'"
        @click="selectTool('line')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M2 14L14 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Arrow -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'arrow' }"
        aria-label="Arrow (A)"
        title="Arrow (A)"
        :aria-pressed="store.tool === 'arrow'"
        @click="selectTool('arrow')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M2 14L14 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M9 2h5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Text -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'text' }"
        aria-label="Text (T)"
        title="Text (T)"
        :aria-pressed="store.tool === 'text'"
        @click="selectTool('text')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 3h10M8 3v10M5 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Pen -->
      <button
        class="diagram-toolbar__btn focus-ring"
        :class="{ 'diagram-toolbar__btn--active': store.tool === 'pen' }"
        aria-label="Pen (P)"
        title="Pen (P)"
        :aria-pressed="store.tool === 'pen'"
        @click="selectTool('pen')"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 13L2 14l1-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 13l7-7 2 2-7 7-2-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 6l1-1a1.414 1.414 0 0 1 2 2l-1 1-2-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

    </div>

    <div class="diagram-toolbar__divider" aria-hidden="true" />

    <!-- Zoom controls -->
    <div class="diagram-toolbar__group" role="group" aria-label="Zoom controls">

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Zoom out"
        @click="zoomOut"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4.5 7h5M12 12l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <button
        class="diagram-toolbar__zoom-label focus-ring"
        aria-label="Reset zoom"
        @click="resetZoom"
      >
        {{ zoomPercent }}
      </button>

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Zoom in"
        @click="zoomIn"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 4.5v5M4.5 7h5M12 12l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

    </div>

    <div class="diagram-toolbar__divider" aria-hidden="true" />

    <!-- Undo / Redo -->
    <div class="diagram-toolbar__group" role="group" aria-label="History">

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Undo"
        :disabled="!store.canUndo"
        @click="store.undoAction()"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 7a5 5 0 1 1 0 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M3 3v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Redo"
        :disabled="!store.canRedo"
        @click="store.redoAction()"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M13 7a5 5 0 1 0 0 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M13 3v4H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

    </div>

    <div class="diagram-toolbar__divider" aria-hidden="true" />

    <!-- Export -->
    <div class="diagram-toolbar__group" role="group" aria-label="Export">

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Export SVG"
        title="Export SVG"
        :disabled="!hasElements"
        @click="handleExportSvg"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M8 11V3M5 8l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <button
        class="diagram-toolbar__btn focus-ring"
        aria-label="Export PNG"
        title="Export PNG"
        :disabled="!hasElements"
        @click="handleExportPng"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 11V7M5 8.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

    </div>

    <div class="diagram-toolbar__divider" aria-hidden="true" />

    <!-- Save indicator (aria-live, always mounted) -->
    <span
      class="diagram-toolbar__save-indicator"
      aria-live="polite"
      aria-atomic="true"
    >{{ saveLabel }}</span>

  </div>
</template>

<style scoped>
.diagram-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  flex-shrink: 0;
  min-height: 44px;
}

.diagram-toolbar__group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.diagram-toolbar__divider {
  width: 1px;
  height: 20px;
  background-color: var(--color-border);
  margin: 0 4px;
  flex-shrink: 0;
}

.diagram-toolbar__btn {
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

.diagram-toolbar__btn:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.diagram-toolbar__btn--active {
  background-color: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
}

.diagram-toolbar__btn--active:hover {
  background-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
  color: var(--color-accent);
}

.diagram-toolbar__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.diagram-toolbar__zoom-label {
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

.diagram-toolbar__zoom-label:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.diagram-toolbar__save-indicator {
  font-size: var(--text-xs, 0.75rem);
  color: var(--color-text-muted);
  padding: 0 4px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 4ch;
}

@media (prefers-reduced-motion: reduce) {
  .diagram-toolbar__btn,
  .diagram-toolbar__zoom-label {
    transition: none;
  }
}
</style>
