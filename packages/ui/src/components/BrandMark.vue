<script setup lang="ts">
/**
 * TaskNote brand mark — single source of truth for the in-app logo.
 *
 * Tile form, same geometry as the favicon (apps/web/public/favicon.svg):
 * lime rounded square with a cut top-right corner (note fold), darker-lime
 * fold flap, ink checkmark. Colors track the theme tokens so the tile and
 * check adapt to light/dark; the favicon hardcodes them — update both
 * together if the mark ever changes.
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
    <!-- Tile with cut top-right corner (note fold) -->
    <path
      d="M9 1 H20 L31 12 V23 A8 8 0 0 1 23 31 H9 A8 8 0 0 1 1 23 V9 A8 8 0 0 1 9 1 Z"
      fill="var(--color-accent, #A3E635)"
    />

    <!-- Fold flap — fixed darker lime: accent-hover is lighter in dark
         theme, which would invert the fold; #4D7C0F reads as shadow over
         both theme accents (matches the favicon) -->
    <path
      d="M20 1 L31 12 H20 Z"
      fill="#4D7C0F"
    />

    <!-- Checkmark — ink -->
    <path
      d="M9.5 17 L14.5 22 L23 11.5"
      stroke="var(--color-bg, #0B0C0E)"
      stroke-width="3.5"
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
