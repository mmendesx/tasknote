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
}>()

// Handle size in screen pixels; dividing by zoom gives scene-space size
const HANDLE_SCREEN_PX = 8
const HANDLE_HALF_SCREEN = HANDLE_SCREEN_PX / 2

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
</script>

<template>
  <!-- Component-level pointer-events: none; individual handles restore pointer-events: all -->
  <g class="diagram-selection-handles" pointer-events="none">
    <!-- Endpoint handles for line/arrow elements -->
    <template v-if="showEndpointHandles && element && isLinearElement(element)">
      <template v-for="idx in [0, 1]" :key="`ep-${idx}`">
        <circle
          :cx="(element as any).points[idx][0]"
          :cy="(element as any).points[idx][1]"
          :r="HANDLE_HALF_SCREEN / zoom"
          fill="white"
          stroke="var(--color-accent, #6366f1)"
          :stroke-width="1.5 / zoom"
          vector-effect="non-scaling-stroke"
          pointer-events="all"
          :data-resize-handle="idx"
          style="cursor: crosshair"
          @pointerdown="(e: PointerEvent) => onHandlePointerDown(idx as 0 | 1, e)"
        />
      </template>
    </template>

    <!-- Shape handles (rect/ellipse/text) — text corner-only; pen skipped -->
    <template v-else-if="element && !isLinearElement(element) && !isPenElement(element)">
      <template v-for="handle in getShapeHandles(bbox)" :key="handle.id">
        <!-- Skip edge handles for text elements -->
        <template v-if="!isTextElement(element) || ['nw','ne','se','sw'].includes(handle.id)">
          <rect
            :x="handle.cx - HANDLE_HALF_SCREEN / zoom"
            :y="handle.cy - HANDLE_HALF_SCREEN / zoom"
            :width="HANDLE_SCREEN_PX / zoom"
            :height="HANDLE_SCREEN_PX / zoom"
            fill="white"
            stroke="var(--color-accent, #6366f1)"
            :stroke-width="1.5 / zoom"
            vector-effect="non-scaling-stroke"
            rx="1"
            pointer-events="all"
            :data-resize-handle="handle.id"
            :style="{ cursor: HANDLE_CURSORS[handle.id] }"
            @pointerdown="(e: PointerEvent) => onHandlePointerDown(handle.id, e)"
          />
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
