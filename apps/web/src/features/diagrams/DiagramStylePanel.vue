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
  { value: 1, label: 'Thin', lineHeight: 1.5 },
  { value: 2, label: 'Medium', lineHeight: 2.5 },
  { value: 4, label: 'Thick', lineHeight: 4 },
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

// ── Swatch display helpers ───────────────────────────────────────────────────

function strokeSwatchColor(value: string): string {
  return value === 'currentColor' ? 'var(--color-text-primary)' : value
}
</script>

<template>
  <Transition name="style-panel-fade">
    <div
      v-if="isVisible"
      class="style-panel diagram-floating-chrome"
      role="group"
      aria-label="Style panel"
    >

      <!-- Stroke / Color -->
      <div
        v-if="hasStrokeElements"
        class="style-panel__group"
        role="group"
        aria-label="Stroke color"
      >
        <span class="style-panel__label" aria-hidden="true">Color</span>
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
              :style="{ background: strokeSwatchColor(item.value) }"
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
        <span class="style-panel__label" aria-hidden="true">Fill</span>
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
            <!-- No-fill swatch: circle with diagonal slash -->
            <span
              v-if="item.value === null"
              class="style-panel__swatch-dot style-panel__swatch-dot--none"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none" />
                <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </span>
            <!-- Colored fill swatch -->
            <span
              v-else
              class="style-panel__swatch-dot"
              :style="{ background: item.value }"
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
        <span class="style-panel__label" aria-hidden="true">Width</span>
        <div class="style-panel__btn-group style-panel__btn-group--segmented">
          <button
            v-for="item in STROKE_WIDTHS"
            :key="item.value"
            class="style-panel__btn style-panel__btn--width focus-ring"
            :class="{ 'style-panel__btn--active': activeStrokeWidth === item.value }"
            :aria-label="item.label"
            :aria-pressed="activeStrokeWidth === item.value"
            @click="applyStrokeWidth(item.value)"
          >
            <!-- Visual line-weight preview -->
            <span class="style-panel__line-preview" aria-hidden="true">
              <span
                class="style-panel__line-preview-bar"
                :style="{ height: item.lineHeight + 'px' }"
              />
            </span>
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
        <span class="style-panel__label" aria-hidden="true">Size</span>
        <div class="style-panel__btn-group style-panel__btn-group--segmented">
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
  </Transition>
</template>

<style>
/*
 * Non-scoped: give the flex-column ancestor a positioning context so the panel
 * can anchor itself absolutely within the detail area without editing DiagramsView.
 */
.diagrams-view__detail {
  position: relative;
}
</style>

<style>
@import './diagram-chrome.css';
</style>

<style scoped>
/* ── Floating panel ─────────────────────────────────────────────────────────── */

.style-panel {
  position: absolute;
  top: 56px; /* clear detail-header (44px) + 12px breathing room */
  right: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  width: max-content;
  max-width: 240px;
  pointer-events: auto;
}

/* ── Transition: fade + slight translate ────────────────────────────────────── */

.style-panel-fade-enter-active,
.style-panel-fade-leave-active {
  transition:
    opacity var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    transform var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.style-panel-fade-enter-from,
.style-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .style-panel-fade-enter-active,
  .style-panel-fade-leave-active {
    transition: none;
  }
}

/* ── Group layout ────────────────────────────────────────────────────────────── */

.style-panel__group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.style-panel__label {
  font-size: var(--text-xs, 0.75rem);
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 3ch;
  line-height: 1;
}

/* ── Swatch buttons ─────────────────────────────────────────────────────────── */

.style-panel__swatches {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.style-panel__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  transition:
    border-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.style-panel__swatch:hover {
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

/*
 * Active state: outer ring via box-shadow (offset ring technique).
 * Uses accent color for the ring so it stays visible on any swatch color.
 */
.style-panel__swatch--active {
  box-shadow: 0 0 0 2px var(--color-surface-elevated), 0 0 0 4px var(--color-accent);
}

.style-panel__swatch-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.style-panel__swatch-dot--none {
  background: transparent;
}

/* ── Width / font-size segmented button groups ───────────────────────────────── */

.style-panel__btn-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.style-panel__btn-group--segmented {
  gap: 0;
  border-radius: var(--radius-control, 6px);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.style-panel__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-right: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-xs, 0.75rem);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  outline: none;
  transition:
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.style-panel__btn:last-child {
  border-right: none;
}

.style-panel__btn:hover {
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  color: var(--color-text-primary);
}

.style-panel__btn--active {
  background-color: var(--color-accent);
  color: #fff;
}

.style-panel__btn--active:hover {
  background-color: var(--color-accent);
  color: #fff;
}

/* ── Stroke width preview ───────────────────────────────────────────────────── */

.style-panel__btn--width {
  padding: 0 10px;
}

.style-panel__line-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
}

.style-panel__line-preview-bar {
  display: block;
  width: 100%;
  background: currentColor;
  border-radius: 2px;
}

/* ── Focus ring ──────────────────────────────────────────────────────────────── */

.style-panel__swatch.focus-ring:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.style-panel__btn.focus-ring:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .style-panel__swatch,
  .style-panel__btn {
    transition: none;
  }
}
</style>
