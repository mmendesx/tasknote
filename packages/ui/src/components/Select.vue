<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectIcon,
  SelectValue,
} from 'reka-ui'
import type { SelectOption } from './select-types'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  options: SelectOption[]
  label?: string
  placeholder?: string
  disabled?: boolean
  error?: string
  id?: string
}>(), {
  modelValue: '',
  placeholder: 'Select…',
  disabled: false,
  error: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const stringValue = computed(() =>
  props.modelValue === '' || props.modelValue === undefined || props.modelValue === null
    ? ''
    : String(props.modelValue)
)

function onSelect(raw: string) {
  if (raw === '') {
    emit('update:modelValue', '')
    return
  }
  const matched = props.options.find((o) => String(o.value) === raw)
  emit('update:modelValue', matched ? matched.value : raw)
}
</script>

<template>
  <div class="sel-wrapper">
    <label v-if="label" :for="id" class="sel-label">{{ label }}</label>

    <SelectRoot
      :model-value="stringValue"
      :disabled="disabled"
      @update:model-value="onSelect"
    >
      <SelectTrigger
        :id="id"
        class="sel-trigger"
        :class="{
          'sel-trigger--empty': !stringValue,
          'sel-trigger--disabled': disabled,
          'sel-trigger--error': !!error,
        }"
        :disabled="disabled"
      >
        <SelectValue :placeholder="placeholder" />
        <SelectIcon class="sel-trigger__chevron">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          class="sel-content"
          :side-offset="6"
          position="popper"
        >
          <SelectViewport class="sel-viewport">
            <SelectItem
              v-for="opt in options"
              :key="opt.value"
              :value="String(opt.value)"
              class="sel-item"
            >
              <SelectItemIndicator class="sel-item__indicator">
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </SelectItemIndicator>
              <SelectItemText>{{ opt.label }}</SelectItemText>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

    <p v-if="error" class="sel-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.sel-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sel-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.sel-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-duration-fast), box-shadow var(--motion-duration-fast);
}

.sel-trigger:hover:not(.sel-trigger--disabled) {
  border-color: var(--color-text-muted);
}

.sel-trigger:focus-visible {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.sel-trigger--empty {
  color: var(--color-text-muted);
}

.sel-trigger--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sel-trigger--error {
  border-color: var(--color-status-blocked);
}

.sel-trigger--error:focus-visible {
  border-color: var(--color-status-blocked);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-status-blocked) 20%, transparent);
}

.sel-trigger__chevron {
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  transition: color var(--motion-duration-fast);
}

.sel-trigger:hover .sel-trigger__chevron {
  color: var(--color-text-primary);
}

.sel-error {
  font-size: var(--text-xs);
  color: var(--color-status-blocked);
  margin: 0;
}
</style>

<style>
/* Popover content rendered in Portal at <body> — must be non-scoped */
.sel-content {
  z-index: 200;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height, 320px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  padding: 4px;
  animation: sel-fade-in 120ms ease-out;
}

@keyframes sel-fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sel-viewport {
  padding: 0;
  overflow-y: auto;
  max-height: inherit;
}

.sel-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 28px 7px 10px;
  border-radius: var(--radius-control);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
  outline: none;
  transition: background-color var(--motion-duration-fast), color var(--motion-duration-fast);
}

.sel-item[data-highlighted] {
  background: color-mix(in srgb, var(--color-accent) 16%, transparent);
  color: var(--color-text-primary);
}

.sel-item[data-state="checked"] {
  color: var(--color-accent);
  font-weight: 500;
}

.sel-item[data-disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

.sel-item__indicator {
  position: absolute;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
}
</style>
