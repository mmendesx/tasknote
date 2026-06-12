<script setup lang="ts">
import { Tooltip } from '@tasknote/ui'
import { useDiagramsStore } from '@/stores/diagrams'
import { TOOL_ICONS } from './icons'

// ── Store ─────────────────────────────────────────────────────────────────────

const store = useDiagramsStore()

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  { value: 'select',    label: 'Select',    shortcut: 'V' },
  { value: 'hand',      label: 'Hand',      shortcut: 'H' },
  { value: 'rectangle', label: 'Rectangle', shortcut: 'R' },
  { value: 'ellipse',   label: 'Ellipse',   shortcut: 'E' },
  { value: 'line',      label: 'Line',      shortcut: 'L' },
  { value: 'arrow',     label: 'Arrow',     shortcut: 'A' },
  { value: 'text',      label: 'Text',      shortcut: 'T' },
  { value: 'pen',       label: 'Pen',       shortcut: 'P' },
] as const

type ToolValue = (typeof TOOLS)[number]['value']

// ── Actions ───────────────────────────────────────────────────────────────────

function selectTool(value: ToolValue): void {
  store.setTool(value)
}
</script>

<template>
  <div
    class="diagram-tool-palette diagram-floating-chrome"
    role="toolbar"
    aria-label="Drawing tools"
  >
    <Tooltip
      v-for="tool in TOOLS"
      :key="tool.value"
      :content="`${tool.label} — ${tool.shortcut}`"
      side="bottom"
    >
      <button
        class="diagram-tool-palette__btn focus-ring"
        :class="{ 'diagram-tool-palette__btn--active': store.tool === tool.value }"
        :aria-pressed="store.tool === tool.value"
        :aria-label="`${tool.label} — ${tool.shortcut}`"
        @click="selectTool(tool.value)"
      >
        <component
          :is="TOOL_ICONS[tool.value]"
          aria-hidden="true"
        />
      </button>
    </Tooltip>
  </div>
</template>

<style scoped>
.diagram-tool-palette {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  /* pill shape */
  border-radius: 9999px;
}

.diagram-tool-palette__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition:
    background-color var(--motion-duration-fast, 120ms) var(--motion-easing, ease),
    color var(--motion-duration-fast, 120ms) var(--motion-easing, ease);
}

.diagram-tool-palette__btn:hover {
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  color: var(--color-text-primary);
}

.diagram-tool-palette__btn--active {
  background-color: var(--color-accent);
  color: #fff;
}

.diagram-tool-palette__btn--active:hover {
  background-color: color-mix(in srgb, var(--color-accent) 88%, #000);
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .diagram-tool-palette__btn {
    transition: none;
  }
}
</style>
