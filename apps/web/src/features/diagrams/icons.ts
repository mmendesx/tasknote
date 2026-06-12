/**
 * Diagram icon set — stroke-based, 20×20 viewBox, currentColor.
 *
 * Each icon is a Vue functional component (h-based render function) that
 * forwards all attrs/listeners so callers can add aria-hidden, class, etc.
 * without any wrapper boilerplate.
 *
 * Usage:
 *   import { IconSelect, IconRectangle } from './icons'
 *   <IconSelect width="20" height="20" aria-hidden="true" />
 *
 * All icons use stroke-width 1.5, stroke-linecap round, stroke-linejoin round
 * unless a specific shape (rect, ellipse) benefits from the default square join.
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

/** Cursor / select tool */
export const IconSelect = makeIcon('IconSelect', () => [
  h('path', { d: 'M4 2.5 L16.5 10 L10 11.5 L7.5 18 Z' }),
])

/** Hand / pan tool */
export const IconHand = makeIcon('IconHand', () => [
  h('path', {
    d: 'M10 2.5 v6 M8 4.5 v-2.5 M6 5.5 v-2 M12 4.5 v-2.5 M14 5.5 v2 l0.5 5A1.75 1.75 0 0 1 12.75 14.5 H9 A2.5 2.5 0 0 1 6.5 12 V8',
  }),
])

/** Rectangle draw tool */
export const IconRectangle = makeIcon('IconRectangle', () => [
  h('rect', {
    x: '2.5',
    y: '5',
    width: '15',
    height: '10',
    rx: '1.5',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.5',
  }),
])

/** Ellipse draw tool */
export const IconEllipse = makeIcon('IconEllipse', () => [
  h('ellipse', {
    cx: '10',
    cy: '10',
    rx: '7.5',
    ry: '5',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.5',
  }),
])

/** Line draw tool */
export const IconLine = makeIcon('IconLine', () => [
  h('line', {
    x1: '3',
    y1: '17',
    x2: '17',
    y2: '3',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  }),
])

/** Arrow draw tool */
export const IconArrow = makeIcon('IconArrow', () => [
  h('path', { d: 'M3 17 L17 3' }),
  h('path', { d: 'M11 3 H17 V9' }),
])

/** Text insert tool */
export const IconText = makeIcon('IconText', () => [
  h('path', { d: 'M4 4 H16 M10 4 V16 M7 16 H13' }),
])

/** Pen / freehand draw tool */
export const IconPen = makeIcon('IconPen', () => [
  h('path', { d: 'M3.5 16.5 L2.5 17.5 L3.5 16.5 Z' }),
  h('path', { d: 'M3.5 16.5 L12 8 L14.5 10.5 L6 19 L3.5 16.5 Z' }),
  h('path', {
    d: 'M12 8 L13.5 6.5 A1.768 1.768 0 0 1 16 9 L14.5 10.5 L12 8 Z',
  }),
])

/** Zoom in */
export const IconZoomIn = makeIcon('IconZoomIn', () => [
  h('circle', {
    cx: '8.5',
    cy: '8.5',
    r: '6',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.5',
  }),
  h('path', { d: 'M8.5 5.5 V11.5 M5.5 8.5 H11.5 M14.5 14.5 L18 18' }),
])

/** Zoom out */
export const IconZoomOut = makeIcon('IconZoomOut', () => [
  h('circle', {
    cx: '8.5',
    cy: '8.5',
    r: '6',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.5',
  }),
  h('path', { d: 'M5.5 8.5 H11.5 M14.5 14.5 L18 18' }),
])

/** Undo */
export const IconUndo = makeIcon('IconUndo', () => [
  h('path', {
    d: 'M3.5 8.5 A6.5 6.5 0 1 1 3.5 11.5',
  }),
  h('path', { d: 'M3.5 3.5 V8.5 H8.5' }),
])

/** Redo */
export const IconRedo = makeIcon('IconRedo', () => [
  h('path', {
    d: 'M16.5 8.5 A6.5 6.5 0 1 0 16.5 11.5',
  }),
  h('path', { d: 'M16.5 3.5 V8.5 H11.5' }),
])

/** Export / download */
export const IconExport = makeIcon('IconExport', () => [
  h('path', { d: 'M10 13 V3 M6.5 9.5 L10 13 L13.5 9.5' }),
  h('path', { d: 'M3.5 15.5 H16.5' }),
])

/** Trash / delete */
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

/**
 * Empty-state diagram icon — a stylised canvas with dashed interior nodes.
 * Intended for use in larger empty-state illustrations (render at 48–64px).
 */
export const IconDiagramEmpty = makeIcon('IconDiagramEmpty', () => [
  // Outer canvas frame
  h('rect', {
    x: '2',
    y: '2',
    width: '16',
    height: '16',
    rx: '2',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.5',
    'stroke-dasharray': '3 2',
  }),
  // Top-left node
  h('rect', {
    x: '4',
    y: '4',
    width: '4',
    height: '3',
    rx: '0.75',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.25',
  }),
  // Bottom-right node
  h('rect', {
    x: '12',
    y: '13',
    width: '4',
    height: '3',
    rx: '0.75',
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.25',
  }),
  // Connector line between nodes
  h('path', {
    d: 'M8 5.5 H10 Q12 5.5 12 7.5 V13',
    fill: 'none',
    'stroke-width': '1.25',
    'stroke-dasharray': '2 1.5',
  }),
])

// ── Convenience map (tool-value → icon component) ─────────────────────────────

/**
 * Maps diagram tool values to their corresponding icon components.
 * Useful for dynamic rendering in toolbar or palette components.
 *
 * @example
 *   const Icon = TOOL_ICONS[store.tool]
 *   <component :is="Icon" aria-hidden="true" />
 */
export const TOOL_ICONS = {
  select:    IconSelect,
  hand:      IconHand,
  rectangle: IconRectangle,
  ellipse:   IconEllipse,
  line:      IconLine,
  arrow:     IconArrow,
  text:      IconText,
  pen:       IconPen,
} as const satisfies Record<string, Component>

export type DiagramToolIconKey = keyof typeof TOOL_ICONS
