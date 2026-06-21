<script setup lang="ts">
import type { DiagramElement } from '@tasknote/shared'

defineProps<{ element: DiagramElement }>()

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

/**
 * SVG points attr for a connector. Renders from the stored route:
 * [start, ...waypoints, end]. No routing is performed at render time.
 */
function routeToAttr(el: LineEl | ArrowEl): string {
  const route: [number, number][] = [el.points[0], ...(el.waypoints ?? []), el.points[1]]
  return pointsToAttr(route)
}
</script>

<template>
  <!-- rectangle -->
  <template v-if="element.type === 'rectangle'">
    <clipPath :id="`label-clip-${element.id}`">
      <rect
        :x="(element as RectEl).x"
        :y="(element as RectEl).y"
        :width="(element as RectEl).width"
        :height="(element as RectEl).height"
      />
    </clipPath>
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
      fill="transparent"
      class="diagram-hit-target"
    />
    <!-- centered label — only when label is non-empty/non-whitespace -->
    <text
      v-if="(element as RectEl).label?.trim()"
      :x="(element as RectEl).x + (element as RectEl).width / 2"
      :y="(element as RectEl).y + (element as RectEl).height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      font-size="14"
      :fill="(element as RectEl).stroke"
      :clip-path="`url(#label-clip-${element.id})`"
      pointer-events="none"
    >{{ (element as RectEl).label }}</text>
  </template>

  <!-- ellipse -->
  <template v-else-if="element.type === 'ellipse'">
    <clipPath :id="`label-clip-${element.id}`">
      <ellipse
        :cx="(element as EllEl).x + (element as EllEl).width / 2"
        :cy="(element as EllEl).y + (element as EllEl).height / 2"
        :rx="(element as EllEl).width / 2"
        :ry="(element as EllEl).height / 2"
      />
    </clipPath>
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
      fill="transparent"
      class="diagram-hit-target"
    />
    <!-- centered label — only when label is non-empty/non-whitespace -->
    <text
      v-if="(element as EllEl).label?.trim()"
      :x="(element as EllEl).x + (element as EllEl).width / 2"
      :y="(element as EllEl).y + (element as EllEl).height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      font-size="14"
      :fill="(element as EllEl).stroke"
      :clip-path="`url(#label-clip-${element.id})`"
      pointer-events="none"
    >{{ (element as EllEl).label }}</text>
  </template>

  <!-- line -->
  <template v-else-if="element.type === 'line'">
    <polyline
      :data-element-id="element.id"
      :points="routeToAttr(element as LineEl)"
      fill="none"
      :stroke="(element as LineEl).stroke"
      :stroke-width="(element as LineEl).strokeWidth"
    />
    <!-- wide transparent hit-target covers the full elbow path -->
    <polyline
      :data-element-id="element.id"
      :points="routeToAttr(element as LineEl)"
      fill="none"
      stroke="transparent"
      class="diagram-hit-target"
    />
  </template>

  <!-- arrow -->
  <template v-else-if="element.type === 'arrow'">
    <polyline
      :data-element-id="element.id"
      :points="routeToAttr(element as ArrowEl)"
      fill="none"
      :stroke="(element as ArrowEl).stroke"
      :stroke-width="(element as ArrowEl).strokeWidth"
      marker-end="url(#diagram-arrowhead)"
    />
    <!-- wide transparent hit-target covers the full elbow path -->
    <polyline
      :data-element-id="element.id"
      :points="routeToAttr(element as ArrowEl)"
      fill="none"
      stroke="transparent"
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
      class="diagram-hit-target"
    />
  </template>
</template>

<style scoped>
.diagram-hit-target {
  cursor: default;
  /* 12 screen-px hit area at any zoom. The viewport <g> in DiagramCanvas sets
     --diagram-hit-sw (12 / zoom): zoom changes update one CSS var instead of
     re-rendering every element component. */
  stroke-width: var(--diagram-hit-sw, 12);
}
</style>
