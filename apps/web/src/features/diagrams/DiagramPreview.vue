<script setup lang="ts">
// In-progress draft overlay for rect/ellipse/line/arrow/pen. Strokes use
// `currentColor` so the preview is visible in both light and dark themes
// (the canvas sets `color` to a design token). pointer-events:none via the
// shared .diagram-preview class on the host.

defineProps<{
  shape: { type: 'rectangle' | 'ellipse'; x: number; y: number; width: number; height: number } | null
  linear: { type: 'line' | 'arrow'; ax: number; ay: number; bx: number; by: number } | null
  pen: [number, number][] | null
}>()

function pointsToAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}
</script>

<template>
  <!-- rectangle / ellipse in progress -->
  <rect
    v-if="shape && shape.type === 'rectangle'"
    class="diagram-preview"
    :x="shape.x"
    :y="shape.y"
    :width="shape.width"
    :height="shape.height"
    stroke="currentColor"
    fill="none"
    stroke-width="2"
    stroke-dasharray="4 3"
  />
  <ellipse
    v-else-if="shape && shape.type === 'ellipse'"
    class="diagram-preview"
    :cx="shape.x + shape.width / 2"
    :cy="shape.y + shape.height / 2"
    :rx="shape.width / 2"
    :ry="shape.height / 2"
    stroke="currentColor"
    fill="none"
    stroke-width="2"
    stroke-dasharray="4 3"
  />

  <!-- line / arrow in progress -->
  <line
    v-if="linear && linear.type === 'line'"
    class="diagram-preview"
    :x1="linear.ax"
    :y1="linear.ay"
    :x2="linear.bx"
    :y2="linear.by"
    stroke="currentColor"
    stroke-width="2"
    stroke-dasharray="4 3"
  />
  <line
    v-else-if="linear && linear.type === 'arrow'"
    class="diagram-preview"
    :x1="linear.ax"
    :y1="linear.ay"
    :x2="linear.bx"
    :y2="linear.by"
    stroke="currentColor"
    stroke-width="2"
    stroke-dasharray="4 3"
    marker-end="url(#diagram-arrowhead)"
  />

  <!-- pen stroke in progress -->
  <polyline
    v-if="pen && pen.length >= 2"
    class="diagram-preview"
    :points="pointsToAttr(pen)"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-dasharray="4 3"
  />
</template>

<style scoped>
.diagram-preview {
  pointer-events: none;
}
</style>
