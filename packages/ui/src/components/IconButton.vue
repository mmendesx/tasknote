<script setup lang="ts">
import { computed } from 'vue'
import clsx from 'clsx'

type Size = 'sm' | 'md'
type Variant = 'ghost' | 'secondary' | 'danger'

const props = withDefaults(defineProps<{
  label: string
  size?: Size
  variant?: Variant
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  size: 'md',
  variant: 'ghost',
  disabled: false,
  type: 'button',
})

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
}

const variantClasses: Record<Variant, string> = {
  ghost:     'bg-transparent text-text-muted hover:text-text-primary hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent',
  secondary: 'bg-surface border border-border text-text-primary hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-accent',
  danger:    'bg-transparent text-status-blocked hover:bg-status-blocked/10 focus-visible:ring-2 focus-visible:ring-status-blocked',
}

const classes = computed(() =>
  clsx(
    'inline-flex items-center justify-center rounded-control font-sans flex-shrink-0',
    'transition-colors duration-fast outline-none',
    'disabled:opacity-50 disabled:pointer-events-none',
    'focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
    sizeClasses[props.size],
    variantClasses[props.variant],
  )
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :class="classes"
  >
    <slot />
  </button>
</template>
