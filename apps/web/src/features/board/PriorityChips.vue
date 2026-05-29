<script setup lang="ts">
import { computed, ref, nextTick, useTemplateRef } from 'vue'
import type { Priority } from '@tasknote/shared'
import { priorityConfig, PRIORITY_ORDER } from './priorityConfig'

const props = withDefaults(defineProps<{
  modelValue: Priority
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: Priority]
}>()

// Roving tabindex index — drives both tabindex and programmatic focus
const focusedIndex = ref(PRIORITY_ORDER.indexOf(props.modelValue))

const activeIndex = computed(() => PRIORITY_ORDER.indexOf(props.modelValue))

// Template refs for each chip button (index-matched to PRIORITY_ORDER)
const chipRefs = useTemplateRef<HTMLButtonElement[]>('chipRefs')

function select(priority: Priority, index: number) {
  if (props.disabled) return
  focusedIndex.value = index
  emit('update:modelValue', priority)
}

async function moveFocus(newIndex: number) {
  if (props.disabled) return
  focusedIndex.value = newIndex
  emit('update:modelValue', PRIORITY_ORDER[newIndex])
  await nextTick()
  chipRefs.value?.[newIndex]?.focus()
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (props.disabled) return

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocus((index + 1) % PRIORITY_ORDER.length)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus((index - 1 + PRIORITY_ORDER.length) % PRIORITY_ORDER.length)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    select(PRIORITY_ORDER[index], index)
  }
}

function getTabIndex(index: number): 0 | -1 {
  // Roving tabindex: only the active chip is reachable via Tab
  return index === activeIndex.value ? 0 : -1
}
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Priority"
    class="priority-chips"
    :aria-disabled="disabled || undefined"
  >
    <button
      v-for="(priority, index) in PRIORITY_ORDER"
      :key="priority"
      ref="chipRefs"
      type="button"
      role="radio"
      :aria-checked="priority === modelValue"
      :tabindex="getTabIndex(index)"
      :disabled="disabled"
      class="priority-chip"
      :class="{ 'priority-chip--active': priority === modelValue }"
      :style="
        priority === modelValue
          ? {
              backgroundColor: priorityConfig[priority].color,
              borderColor: priorityConfig[priority].color,
              color: 'var(--color-bg)',
            }
          : {
              borderColor: priorityConfig[priority].color + '55',
              color: priorityConfig[priority].color,
            }
      "
      @click="select(priority, index)"
      @keydown="onKeydown($event, index)"
    >
      {{ priorityConfig[priority].label }}
    </button>
  </div>
</template>

<style scoped>
.priority-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.priority-chips[aria-disabled='true'] {
  opacity: 0.5;
  pointer-events: none;
}

.priority-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid;
  background-color: transparent;
  font-size: var(--text-xs, 0.75rem);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--motion-duration-fast, 150ms) var(--motion-easing, cubic-bezier(0.4, 0, 0.2, 1)),
    color var(--motion-duration-fast, 150ms) var(--motion-easing, cubic-bezier(0.4, 0, 0.2, 1)),
    border-color var(--motion-duration-fast, 150ms) var(--motion-easing, cubic-bezier(0.4, 0, 0.2, 1)),
    box-shadow var(--motion-duration-fast, 150ms) var(--motion-easing, cubic-bezier(0.4, 0, 0.2, 1));
  white-space: nowrap;
  /* Reset button baseline */
  font-family: inherit;
  line-height: 1;
}

.priority-chip:focus-visible {
  outline: 2px solid var(--color-focus-ring, var(--color-accent));
  outline-offset: 2px;
}

.priority-chip:not(.priority-chip--active):not(:disabled):hover {
  background-color: color-mix(in srgb, currentColor 8%, transparent);
}

.priority-chip:disabled {
  cursor: not-allowed;
}
</style>
