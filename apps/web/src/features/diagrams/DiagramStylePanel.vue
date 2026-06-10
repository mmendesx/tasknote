<script setup lang="ts">
import { computed } from 'vue'
import { useDiagramsStore } from '@/stores/diagrams'
import type { DiagramElement } from '@tasknote/shared'

const store = useDiagramsStore()

// ── Palette constants ────────────────────────────────────────────────────────

const STROKE_PALETTE = [
  { value: 'currentColor', label: 'Theme default' },
  { value: '#e03131', label: 'Red' },
  { value: '#2f9e44', label: 'Green' },
  { value: '#1971c2', label: 'Blue' },
  { value: '#f08c00', label: 'Orange' },
  { value: '#9c36b5', label: 'Purple' },
] as const

const FILL_PALETTE = [
  { value: null, label: 'No fill' },
  { value: '#e03131', label: 'Red fill' },
  { value: '#2f9e44', label: 'Green fill' },
  { value: '#1971c2', label: 'Blue fill' },
  { value: '#f08c00', label: 'Orange fill' },
  { value: '#9c36b5', label: 'Purple fill' },
] as const

const STROKE_WIDTHS = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Medium' },
  { value: 4, label: 'Thick' },
] as const

const FONT_SIZES = [
  { value: 12, label: 'S' },
  { value: 16, label: 'M' },
  { value: 24, label: 'L' },
] as const

// ── Derived state ────────────────────────────────────────────────────────────

const isVisible = computed(() => store.selectedIds.length > 0)

const selectedElements = computed<DiagramElement[]>(() =>
  store.elements.filter((e) => store.selectedIds.includes(e.id)),
)

/** True when at least one selected element has a `stroke` (or `color`) field. */
const hasStrokeElements = computed(() =>
  selectedElements.value.some((e) => e.type !== 'text' || true), // all types have stroke or color
)

/** True when at least one selected element is a shape (rect/ellipse). */
const hasFillElements = computed(() =>
  selectedElements.value.some((e) => e.type === 'rectangle' || e.type === 'ellipse'),
)

/** True when at least one selected element supports strokeWidth. */
const hasStrokeWidthElements = computed(() =>
  selectedElements.value.some((e) => e.type !== 'text'),
)

/** True when at least one selected element is a text node. */
const hasTextElements = computed(() =>
  selectedElements.value.some((e) => e.type === 'text'),
)

/**
 * Active stroke value: the shared stroke/color across all applicable elements,
 * or undefined when they differ.
 */
const activeStroke = computed<string | undefined>(() => {
  const applicable = selectedElements.value.map((e) => {
    if (e.type === 'text') return e.color
    return e.stroke
  })
  if (applicable.length === 0) return undefined
  const first = applicable[0]
  return applicable.every((v) => v === first) ? first : undefined
})

/**
 * Active fill: shared fill across all shape elements, or undefined when they differ.
 */
const activeFill = computed<string | null | undefined>(() => {
  const shapes = selectedElements.value.filter(
    (e) => e.type === 'rectangle' || e.type === 'ellipse',
  )
  if (shapes.length === 0) return undefined
  const fills = shapes.map((e) => (e as { fill?: string | null }).fill ?? null)
  const first = fills[0]
  return fills.every((v) => v === first) ? first : undefined
})

/**
 * Active strokeWidth: shared width across all non-text elements, or undefined.
 */
const activeStrokeWidth = computed<number | undefined>(() => {
  const applicable = selectedElements.value
    .filter((e) => e.type !== 'text')
    .map((e) => (e as { strokeWidth: number }).strokeWidth)
  if (applicable.length === 0) return undefined
  const first = applicable[0]
  return applicable.every((v) => v === first) ? first : undefined
})

/**
 * Active fontSize: shared fontSize across all text elements, or undefined.
 */
const activeFontSize = computed<number | undefined>(() => {
  const texts = selectedElements.value.filter((e) => e.type === 'text')
  if (texts.length === 0) return undefined
  const sizes = texts.map((e) => (e as { fontSize: number }).fontSize)
  const first = sizes[0]
  return sizes.every((v) => v === first) ? first : undefined
})

// ── Actions ──────────────────────────────────────────────────────────────────

function applyStroke(value: string): void {
  store.applyStyle({ stroke: value })
}

function applyFill(value: string | null): void {
  store.applyStyle({ fill: value })
}

function applyStrokeWidth(value: number): void {
  store.applyStyle({ strokeWidth: value })
}

function applyFontSize(value: number): void {
  store.applyStyle({ fontSize: value })
}
</script>

<template>
  <div
    v-if="isVisible"
    class="style-panel"
    role="group"
    aria-label="Style panel"
  >

    <!-- Stroke / Color -->
    <div class="style-panel__group" role="group" aria-label="Stroke color">
      <span class="style-panel__label">Color</span>
      <div class="style-panel__swatches">
        <button
          v-for="item in STROKE_PALETTE"
          :key="item.value"
          class="style-panel__swatch focus-ring"
          :class="{ 'style-panel__swatch--active': activeStroke === item.value }"
          :aria-label="item.label"
          :aria-pressed="activeStroke === item.value"
          @click="applyStroke(item.value)"
        >
          <span
            class="style-panel__swatch-dot"
            :style="{ background: item.value === 'currentColor' ? 'var(--color-text-primary)' : item.value }"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <!-- Fill (shapes only) -->
    <div
      v-if="hasFillElements"
      class="style-panel__group"
      role="group"
      aria-label="Fill color"
    >
      <span class="style-panel__label">Fill</span>
      <div class="style-panel__swatches">
        <button
          v-for="item in FILL_PALETTE"
          :key="String(item.value)"
          class="style-panel__swatch focus-ring"
          :class="{ 'style-panel__swatch--active': activeFill === item.value }"
          :aria-label="item.label"
          :aria-pressed="activeFill === item.value"
          @click="applyFill(item.value)"
        >
          <span
            class="style-panel__swatch-dot"
            :class="{ 'style-panel__swatch-dot--none': item.value === null }"
            :style="item.value !== null ? { background: item.value } : {}"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <!-- Stroke width (non-text elements) -->
    <div
      v-if="hasStrokeWidthElements"
      class="style-panel__group"
      role="group"
      aria-label="Stroke width"
    >
      <span class="style-panel__label">Width</span>
      <div class="style-panel__btn-group">
        <button
          v-for="item in STROKE_WIDTHS"
          :key="item.value"
          class="style-panel__btn focus-ring"
          :class="{ 'style-panel__btn--active': activeStrokeWidth === item.value }"
          :aria-label="item.label"
          :aria-pressed="activeStrokeWidth === item.value"
          @click="applyStrokeWidth(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <!-- Font size (text elements only) -->
    <div
      v-if="hasTextElements"
      class="style-panel__group"
      role="group"
      aria-label="Font size"
    >
      <span class="style-panel__label">Size</span>
      <div class="style-panel__btn-group">
        <button
          v-for="item in FONT_SIZES"
          :key="item.value"
          class="style-panel__btn focus-ring"
          :class="{ 'style-panel__btn--active': activeFontSize === item.value }"
          :aria-label="item.label"
          :aria-pressed="activeFontSize === item.value"
          @click="applyFontSize(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.style-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 12px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  min-height: 40px;
}

.style-panel__group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.style-panel__label {
  font-size: var(--text-xs, 0.75rem);
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 3ch;
}

/* ── Swatch buttons ─────────────────────────────────────────────────────────── */

.style-panel__swatches {
  display: flex;
  align-items: center;
  gap: 2px;
}

.style-panel__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--radius-control);
  border: 1.5px solid transparent;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    border-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.style-panel__swatch:hover {
  background-color: var(--color-surface-elevated);
  border-color: var(--color-border);
}

.style-panel__swatch--active {
  border-color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.style-panel__swatch-dot {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.style-panel__swatch-dot--none {
  background: transparent !important;
  border: 1.5px dashed var(--color-text-muted);
}

/* ── Text / width button groups ─────────────────────────────────────────────── */

.style-panel__btn-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.style-panel__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-control);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-xs, 0.75rem);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.style-panel__btn:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.style-panel__btn--active {
  background-color: color-mix(in srgb, var(--color-accent) 15%, transparent);
  color: var(--color-accent);
}

.style-panel__btn--active:hover {
  background-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
  color: var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .style-panel__swatch,
  .style-panel__btn {
    transition: none;
  }
}
</style>
