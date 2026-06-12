/**
 * Notes icon set — stroke-based, 20×20 viewBox, currentColor.
 *
 * Each icon is a Vue functional component (h-based render function) that
 * forwards all attrs/listeners so callers can add aria-hidden, class, etc.
 * without any wrapper boilerplate.
 *
 * Usage:
 *   import { IconPin, IconNote } from './icons'
 *   <IconPin width="20" height="20" aria-hidden="true" />
 *
 * All icons use stroke-width 1.5, stroke-linecap round, stroke-linejoin round
 * unless a specific shape benefits from the default square join.
 */

import { defineComponent, h } from 'vue'
import type { Component, SVGAttributes } from 'vue'

// ── Shared SVG defaults ────────────────────────────────────────────────────────

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

// ── Icon factory ──────────────────────────────────────────────────────────────

/**
 * Creates a Vue functional component that renders an <svg> with the shared
 * base attributes merged with the given path content.
 *
 * The component forwards all extra attrs (class, style, aria-label, etc.)
 * onto the root <svg> element.
 */
function makeIcon(
  name: string,
  children: () => ReturnType<typeof h>[],
): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () =>
        h(
          'svg',
          { ...BASE_ATTRS, ...attrs },
          children(),
        )
    },
  })
}

// ── Individual icons ──────────────────────────────────────────────────────────

/** Pin — filled pin shape for anchoring/pinning notes */
export const IconPin = makeIcon('IconPin', () => [
  h('path', {
    d: 'M10 2 L13 5 L12 9 L16 13 H11 V18 H9 V13 H4 L8 9 L7 5 Z',
    fill: 'currentColor',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  }),
])

/** Note / empty-state — document outline with ruled lines */
export const IconNote = makeIcon('IconNote', () => [
  h('path', {
    d: 'M5 3 H13 L17 7 V17 A1 1 0 0 1 16 18 H5 A1 1 0 0 1 4 17 V4 A1 1 0 0 1 5 3 Z',
  }),
  h('path', { d: 'M13 3 V7 H17' }),
  h('path', { d: 'M7 10 H13' }),
  h('path', { d: 'M7 13 H11' }),
])

/** Link — chain link for connecting a note to a task */
export const IconLink = makeIcon('IconLink', () => [
  h('path', {
    d: 'M8 12 A3.5 3.5 0 0 0 12 12 L14.5 9.5 A3.5 3.5 0 0 0 9.5 4.5 L8 6',
  }),
  h('path', {
    d: 'M12 8 A3.5 3.5 0 0 0 8 8 L5.5 10.5 A3.5 3.5 0 0 0 10.5 15.5 L12 14',
  }),
])

/** Unlink — broken chain for removing a note-task connection */
export const IconUnlink = makeIcon('IconUnlink', () => [
  h('path', {
    d: 'M8 12 A3.5 3.5 0 0 0 12 12 L14.5 9.5 A3.5 3.5 0 0 0 9.5 4.5 L8 6',
  }),
  h('path', {
    d: 'M12 8 A3.5 3.5 0 0 0 8 8 L5.5 10.5 A3.5 3.5 0 0 0 10.5 15.5 L12 14',
  }),
  h('path', { d: 'M2.5 2.5 L17.5 17.5' }),
])

/** Restore — arrow counterclockwise for restoring a deleted/archived note */
export const IconRestore = makeIcon('IconRestore', () => [
  h('path', {
    d: 'M3.5 8.5 A6.5 6.5 0 1 1 3.5 11.5',
  }),
  h('path', { d: 'M3.5 3.5 V8.5 H8.5' }),
])

/** Back / chevron — left-pointing chevron for navigation */
export const IconBack = makeIcon('IconBack', () => [
  h('path', { d: 'M12.5 4.5 L6.5 10 L12.5 15.5' }),
])

/** Plus — + symbol for adding a new note */
export const IconPlus = makeIcon('IconPlus', () => [
  h('path', { d: 'M10 4 V16 M4 10 H16' }),
])

/** Trash / delete — reused from diagrams icon set */
export const IconTrash = makeIcon('IconTrash', () => [
  h('path', { d: 'M3.5 5.5 H16.5' }),
  h('path', {
    d: 'M8.5 5.5 V3.5 A0.5 0.5 0 0 1 9 3 H11 A0.5 0.5 0 0 1 11.5 3.5 V5.5',
  }),
  h('path', {
    d: 'M6 5.5 L6.5 16 A0.5 0.5 0 0 0 7 16.5 H13 A0.5 0.5 0 0 0 13.5 16 L14 5.5',
  }),
  h('path', { d: 'M8.5 9 V13.5 M11.5 9 V13.5' }),
])
