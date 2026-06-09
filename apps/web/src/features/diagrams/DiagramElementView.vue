<script setup lang="ts">
import { computed } from 'vue'
import type { DiagramElement } from '@tasknote/shared'

const props = defineProps<{ element: DiagramElement; zoom?: number }>()

const hitTargetStrokeWidth = computed(() => 12 / (props.zoom ?? 1))

// Narrow helpers for accessing typed union fields without TS errors
type RectEl = Extract<DiagramElement, { type: 'rectangle' }>
type EllEl = Extract<DiagramElement, { type: 'ellipse' }>
type LineEl = Extract<DiagramElement, { type: 'line' }>
type ArrowEl = Extract<DiagramElement, { type: 'arrow' }>
type TextEl = Extract<DiagramElement, { type: 'text' }>
type PenEl = Extract<DiagramElement, { type: 'pen' }>

function pointsToAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}
</script>

<template>
  <!-- rectangle -->
  <template v-if="element.type === 'rectangle'">
    <rect
      :data-element-id="element.id"
      :x="(element as RectEl).x"
      :y="(element as RectEl).y"
      :width="(element as RectEl).width"
      :height="(element as RectEl).height"
      :stroke="(element as RectEl).stroke"
      :fill="(element as RectEl).fill ?? 'none'"
      :stroke-width="(element as RectEl).strokeWidth"
    />
    <!-- wide transparent hit-target for unfilled rects -->
    <rect
      v-if="!((element as RectEl).fill)"
      :data-element-id="element.id"
      :x="(element as RectEl).x"
      :y="(element as RectEl).y"
      :width="(element as RectEl).width"
      :height="(element as RectEl).height"
      stroke="transparent"
      :stroke-width="hitTargetStrokeWidth"
      fill="transparent"
      class="diagram-hit-target"
    />
  </template>

  <!-- ellipse -->
  <template v-else-if="element.type === 'ellipse'">
    <ellipse
      :data-element-id="element.id"
      :cx="(element as EllEl).x + (element as EllEl).width / 2"
      :cy="(element as EllEl).y + (element as EllEl).height / 2"
      :rx="(element as EllEl).width / 2"
      :ry="(element as EllEl).height / 2"
      :stroke="(element as EllEl).stroke"
      :fill="(element as EllEl).fill ?? 'none'"
      :stroke-width="(element as EllEl).strokeWidth"
    />
    <!-- wide transparent hit-target for unfilled ellipses -->
    <ellipse
      v-if="!((element as EllEl).fill)"
      :data-element-id="element.id"
      :cx="(element as EllEl).x + (element as EllEl).width / 2"
      :cy="(element as EllEl).y + (element as EllEl).height / 2"
      :rx="(element as EllEl).width / 2"
      :ry="(element as EllEl).height / 2"
      stroke="transparent"
      :stroke-width="hitTargetStrokeWidth"
      fill="transparent"
      class="diagram-hit-target"
    />
  </template>

  <!-- line -->
  <template v-else-if="element.type === 'line'">
    <line
      :data-element-id="element.id"
      :x1="(element as LineEl).points[0][0]"
      :y1="(element as LineEl).points[0][1]"
      :x2="(element as LineEl).points[1][0]"
      :y2="(element as LineEl).points[1][1]"
      :stroke="(element as LineEl).stroke"
      :stroke-width="(element as LineEl).strokeWidth"
    />
    <!-- wide transparent hit-target -->
    <line
      :data-element-id="element.id"
      :x1="(element as LineEl).points[0][0]"
      :y1="(element as LineEl).points[0][1]"
      :x2="(element as LineEl).points[1][0]"
      :y2="(element as LineEl).points[1][1]"
      stroke="transparent"
      :stroke-width="hitTargetStrokeWidth"
      class="diagram-hit-target"
    />
  </template>

  <!-- arrow -->
  <template v-else-if="element.type === 'arrow'">
    <line
      :data-element-id="element.id"
      :x1="(element as ArrowEl).points[0][0]"
      :y1="(element as ArrowEl).points[0][1]"
      :x2="(element as ArrowEl).points[1][0]"
      :y2="(element as ArrowEl).points[1][1]"
      :stroke="(element as ArrowEl).stroke"
      :stroke-width="(element as ArrowEl).strokeWidth"
      marker-end="url(#diagram-arrowhead)"
    />
    <!-- wide transparent hit-target -->
    <line
      :data-element-id="element.id"
      :x1="(element as ArrowEl).points[0][0]"
      :y1="(element as ArrowEl).points[0][1]"
      :x2="(element as ArrowEl).points[1][0]"
      :y2="(element as ArrowEl).points[1][1]"
      stroke="transparent"
      :stroke-width="hitTargetStrokeWidth"
      class="diagram-hit-target"
    />
  </template>

  <!-- text -->
  <text
    v-else-if="element.type === 'text'"
    :data-element-id="element.id"
    :x="(element as TextEl).x"
    :y="(element as TextEl).y"
    :font-size="(element as TextEl).fontSize"
    :fill="(element as TextEl).color"
  >{{ (element as TextEl).text }}</text>

  <!-- pen -->
  <template v-else-if="element.type === 'pen'">
    <polyline
      :data-element-id="element.id"
      :points="pointsToAttr((element as PenEl).points)"
      fill="none"
      :stroke="(element as PenEl).stroke"
      :stroke-width="(element as PenEl).strokeWidth"
    />
    <!-- wide transparent hit-target -->
    <polyline
      :data-element-id="element.id"
      :points="pointsToAttr((element as PenEl).points)"
      fill="none"
      stroke="transparent"
      :stroke-width="hitTargetStrokeWidth"
      class="diagram-hit-target"
    />
  </template>
</template>

<style scoped>
.diagram-hit-target {
  cursor: default;
}
</style>
