<script setup lang="ts">
import type { DiagramElement } from '@tasknote/shared'
import type { SelectionBBox } from './useSelection'
import type { HandleId } from './useResize'

const props = defineProps<{
  bbox: SelectionBBox
  zoom: number
  showEndpointHandles: boolean
  element: DiagramElement | null
}>()

const emit = defineEmits<{
  resizeStart: [handleId: HandleId | 0 | 1, screenX: number, screenY: number, event: PointerEvent]
  waypointDragStart: [kind: 'segment' | 'waypoint', index: number, screenX: number, screenY: number, event: PointerEvent]
}>()

// Visible handle size in screen pixels; dividing by zoom gives scene-space size
const HANDLE_SCREEN_PX = 8
const HANDLE_HALF_SCREEN = HANDLE_SCREEN_PX / 2

// Minimum pointer-target size in screen pixels (≥12 per spec)
const HIT_SCREEN_PX = 12
const HIT_HALF_SCREEN = HIT_SCREEN_PX / 2

// Compute handle positions in scene coords relative to bbox
// Each handle: { id, cx, cy } in scene coordinates
function getShapeHandles(bbox: SelectionBBox): Array<{ id: HandleId; cx: number; cy: number }> {
  const { x, y, width, height } = bbox
  return [
    { id: 'nw', cx: x, cy: y },
    { id: 'n',  cx: x + width / 2, cy: y },
    { id: 'ne', cx: x + width, cy: y },
    { id: 'e',  cx: x + width, cy: y + height / 2 },
    { id: 'se', cx: x + width, cy: y + height },
    { id: 's',  cx: x + width / 2, cy: y + height },
    { id: 'sw', cx: x, cy: y + height },
    { id: 'w',  cx: x, cy: y + height / 2 },
  ]
}

function onHandlePointerDown(handleId: HandleId | 0 | 1, event: PointerEvent): void {
  event.stopPropagation()
  emit('resizeStart', handleId, event.clientX, event.clientY, event)
}

// Cursor per handle
const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nw-resize',
  n:  'n-resize',
  ne: 'ne-resize',
  e:  'e-resize',
  se: 'se-resize',
  s:  's-resize',
  sw: 'sw-resize',
  w:  'w-resize',
}

function isTextElement(el: DiagramElement | null): boolean {
  return el?.type === 'text'
}

function isLinearElement(el: DiagramElement | null): boolean {
  return el?.type === 'line' || el?.type === 'arrow'
}

function isPenElement(el: DiagramElement | null): boolean {
  return el?.type === 'pen'
}

/**
 * Compute handles for a selected linear element's waypoints and segment midpoints.
 *
 * Returns:
 * - segmentHandles: midpoint of each segment in the full route (for insertion)
 * - waypointHandles: position of each stored waypoint (for moving)
 *
 * Full route = [points[0], ...(waypoints ?? []), points[1]]
 */
function getLinearWaypointHandles(el: DiagramElement): {
  segmentHandles: Array<{ segmentIndex: number; cx: number; cy: number }>
  waypointHandles: Array<{ waypointIndex: number; cx: number; cy: number }>
} {
  if ((el as any).type !== 'line' && (el as any).type !== 'arrow') {
    return { segmentHandles: [], waypointHandles: [] }
  }
  const pts = (el as any).points as [[number, number], [number, number]]
  const waypoints: [number, number][] = (el as any).waypoints ?? []
  const route: [number, number][] = [pts[0], ...waypoints, pts[1]]

  const segmentHandles = route.slice(0, -1).map((p, s) => ({
    segmentIndex: s,
    cx: (p[0] + route[s + 1]![0]) / 2,
    cy: (p[1] + route[s + 1]![1]) / 2,
  }))

  const waypointHandles = waypoints.map((wp, i) => ({
    waypointIndex: i,
    cx: wp[0],
    cy: wp[1],
  }))

  return { segmentHandles, waypointHandles }
}

function onWaypointPointerDown(
  kind: 'segment' | 'waypoint',
  index: number,
  event: PointerEvent,
): void {
  event.stopPropagation()
  emit('waypointDragStart', kind, index, event.clientX, event.clientY, event)
}
</script>

<template>
  <!-- Component-level pointer-events: none; individual handles restore pointer-events: all -->
  <g class="diagram-selection-handles" pointer-events="none">
    <!-- Drop-shadow filter for visible handles (cheap feDropShadow) -->
    <defs>
      <filter id="diagram-handle-shadow" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" dy="0.5" stdDeviation="0.5" flood-opacity="0.25" />
      </filter>
    </defs>
    <!-- Endpoint handles for line/arrow elements -->
    <template v-if="showEndpointHandles && element && isLinearElement(element)">
      <template v-for="idx in [0, 1]" :key="`ep-${idx}`">
        <!-- g-wrap: carries the data attribute and event; children split visual/hit concerns -->
        <g
          pointer-events="all"
          :data-resize-handle="idx"
          style="cursor: crosshair"
          @pointerdown="(e: PointerEvent) => onHandlePointerDown(idx as 0 | 1, e)"
        >
          <!-- Transparent hit circle — minimum 12 screen px target -->
          <circle
            :cx="(element as any).points[idx][0]"
            :cy="(element as any).points[idx][1]"
            :r="HIT_HALF_SCREEN / zoom"
            fill="transparent"
            stroke="none"
            pointer-events="all"
            class="diagram-handle-hit"
          />
          <!-- Visible circle — 8 screen px diameter, accent border, surface fill, shadow -->
          <circle
            :cx="(element as any).points[idx][0]"
            :cy="(element as any).points[idx][1]"
            :r="HANDLE_HALF_SCREEN / zoom"
            fill="var(--color-surface, #ffffff)"
            stroke="var(--color-accent, #6366f1)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            filter="url(#diagram-handle-shadow)"
            pointer-events="none"
            class="diagram-handle-visible"
          />
        </g>
      </template>

      <!-- Segment-midpoint handles ("+") and waypoint handles — visually distinct from endpoints -->
      <template v-for="seg in getLinearWaypointHandles(element).segmentHandles" :key="`seg-${seg.segmentIndex}`">
        <g
          pointer-events="all"
          :data-waypoint-handle="`seg-${seg.segmentIndex}`"
          style="cursor: move"
          @pointerdown="(e: PointerEvent) => onWaypointPointerDown('segment', seg.segmentIndex, e)"
        >
          <!-- Transparent hit circle — minimum 12 screen px target -->
          <circle
            :cx="seg.cx"
            :cy="seg.cy"
            :r="HIT_HALF_SCREEN / zoom"
            fill="transparent"
            stroke="none"
            pointer-events="all"
            class="diagram-waypoint-handle-hit"
          />
          <!-- Visible: small filled accent diamond (rotated square) — distinct from endpoint circles -->
          <rect
            :x="seg.cx - (HANDLE_SCREEN_PX * 0.6) / zoom / 2"
            :y="seg.cy - (HANDLE_SCREEN_PX * 0.6) / zoom / 2"
            :width="(HANDLE_SCREEN_PX * 0.6) / zoom"
            :height="(HANDLE_SCREEN_PX * 0.6) / zoom"
            :transform="`rotate(45, ${seg.cx}, ${seg.cy})`"
            fill="var(--color-accent, #6366f1)"
            stroke="var(--color-surface, #ffffff)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            filter="url(#diagram-handle-shadow)"
            pointer-events="none"
            class="diagram-waypoint-handle-visible"
          />
        </g>
      </template>

      <template v-for="wp in getLinearWaypointHandles(element).waypointHandles" :key="`wp-${wp.waypointIndex}`">
        <g
          pointer-events="all"
          :data-waypoint-handle="`wp-${wp.waypointIndex}`"
          style="cursor: move"
          @pointerdown="(e: PointerEvent) => onWaypointPointerDown('waypoint', wp.waypointIndex, e)"
        >
          <!-- Transparent hit circle — minimum 12 screen px target -->
          <circle
            :cx="wp.cx"
            :cy="wp.cy"
            :r="HIT_HALF_SCREEN / zoom"
            fill="transparent"
            stroke="none"
            pointer-events="all"
            class="diagram-waypoint-handle-hit"
          />
          <!-- Visible: small filled accent circle — distinct from endpoint circles (solid fill, smaller) -->
          <circle
            :cx="wp.cx"
            :cy="wp.cy"
            :r="(HANDLE_HALF_SCREEN * 0.75) / zoom"
            fill="var(--color-accent, #6366f1)"
            stroke="var(--color-surface, #ffffff)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            filter="url(#diagram-handle-shadow)"
            pointer-events="none"
            class="diagram-waypoint-handle-visible"
          />
        </g>
      </template>
    </template>

    <!-- Shape handles (rect/ellipse/text) — text corner-only; pen skipped -->
    <template v-else-if="element && !isLinearElement(element) && !isPenElement(element)">
      <template v-for="handle in getShapeHandles(bbox)" :key="handle.id">
        <!-- Skip edge handles for text elements -->
        <template v-if="!isTextElement(element) || ['nw','ne','se','sw'].includes(handle.id)">
          <!-- g-wrap: carries the data attribute, cursor and event; children split visual/hit -->
          <g
            pointer-events="all"
            :data-resize-handle="handle.id"
            :style="{ cursor: HANDLE_CURSORS[handle.id] }"
            @pointerdown="(e: PointerEvent) => onHandlePointerDown(handle.id, e)"
          >
            <!-- Transparent hit rect — minimum 12 screen px target -->
            <rect
              :x="handle.cx - HIT_HALF_SCREEN / zoom"
              :y="handle.cy - HIT_HALF_SCREEN / zoom"
              :width="HIT_SCREEN_PX / zoom"
              :height="HIT_SCREEN_PX / zoom"
              fill="transparent"
              stroke="none"
              rx="1"
              pointer-events="all"
              class="diagram-handle-hit"
            />
            <!-- Visible square — 8 screen px, accent border, surface fill, shadow -->
            <rect
              :x="handle.cx - HANDLE_HALF_SCREEN / zoom"
              :y="handle.cy - HANDLE_HALF_SCREEN / zoom"
              :width="HANDLE_SCREEN_PX / zoom"
              :height="HANDLE_SCREEN_PX / zoom"
              fill="var(--color-surface, #ffffff)"
              stroke="var(--color-accent, #6366f1)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
              rx="1"
              filter="url(#diagram-handle-shadow)"
              pointer-events="none"
              class="diagram-handle-visible"
            />
          </g>
        </template>
      </template>
    </template>
  </g>
</template>

<style scoped>
.diagram-selection-handles {
  pointer-events: none;
}
</style>
