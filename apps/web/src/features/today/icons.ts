/**
 * Today icon set — stroke-based, 20×20 viewBox, currentColor.
 *
 * Mirrors the notes icon convention (`features/notes/icons.ts`): each icon is a
 * Vue functional component that forwards all attrs onto the root <svg>, so
 * callers add aria-hidden / class / width without wrapper boilerplate.
 *
 *   import { IconCheck } from './icons'
 *   <IconCheck width="14" height="14" aria-hidden="true" />
 */

import { defineComponent, h } from 'vue'
import type { Component, SVGAttributes } from 'vue'

const BASE_ATTRS = {
  viewBox: '0 0 20 20',
  width: '20',
  height: '20',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.5',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': 'true',
} satisfies SVGAttributes

function makeIcon(name: string, children: () => ReturnType<typeof h>[]): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h('svg', { ...BASE_ATTRS, ...attrs }, children())
    },
  })
}

/** Check — marks a task done. */
export const IconCheck = makeIcon('IconCheck', () => [
  h('path', { d: 'M4 10.5 L8 14.5 L16 6' }),
])

/** Minus — removes a task from today (uncommit). */
export const IconMinus = makeIcon('IconMinus', () => [
  h('path', { d: 'M4 10 H16' }),
])

/** Undo — counter-clockwise arrow, restores a just-completed task. */
export const IconUndo = makeIcon('IconUndo', () => [
  h('path', { d: 'M4 10.5 A6.5 6.5 0 1 0 6 6' }),
  h('path', { d: 'M4 4.5 V10 H9.5' }),
])

/** Sun — calm empty-state glyph for "nothing committed for today". */
export const IconSun = makeIcon('IconSun', () => [
  h('circle', { cx: '10', cy: '10', r: '4' }),
  h('path', {
    d: 'M10 1.5 V3.5 M10 16.5 V18.5 M1.5 10 H3.5 M16.5 10 H18.5 M4 4 L5.4 5.4 M14.6 14.6 L16 16 M4 16 L5.4 14.6 M14.6 5.4 L16 4',
  }),
])

/** Retry — circular arrow for re-loading after an error. */
export const IconRetry = makeIcon('IconRetry', () => [
  h('path', { d: 'M16 10.5 A6.5 6.5 0 1 1 14 6' }),
  h('path', { d: 'M16 4.5 V10 H10.5' }),
])
