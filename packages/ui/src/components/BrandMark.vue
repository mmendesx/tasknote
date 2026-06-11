<script setup lang="ts">
/**
 * TaskNote brand mark — single source of truth for the in-app logo.
 *
 * One canonical geometry (32×32 grid): note sheet with folded corner,
 * lime checkmark. Stroke form matches the app's stroke icon language;
 * the outline follows `currentColor` so it themes with its container,
 * the check always uses the accent token.
 *
 * The favicon (apps/web/public/favicon.svg) is the solid "tile" form of
 * this same geometry — update both together if the mark ever changes.
 */
withDefaults(
  defineProps<{
    /** Rendered size in px (viewBox is 32×32). */
    size?: number | string
  }>(),
  { size: 32 },
)
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="none"
    :width="size"
    :height="size"
    aria-hidden="true"
    class="brand-mark"
  >
    <!-- Note sheet with folded corner -->
    <path
      d="M6 3 H21 L27 9 V29 H6 Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <!-- Fold crease -->
    <path
      d="M21 3 V9 H27"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <!-- Checkmark — brand accent -->
    <path
      d="M11 17 L15 21 L23 12"
      stroke="var(--color-accent)"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex-shrink: 0;
}
</style>
