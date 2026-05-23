<script setup lang="ts">
import { computed } from 'vue'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'secondary',
  size: 'md',
  loading: false,
  disabled: false,
  type: 'button',
})

const variantClasses: Record<Variant, string> = {
  primary:   'bg-accent text-bg font-medium hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent',
  secondary: 'bg-surface border border-border text-text-primary hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-accent',
  ghost:     'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent',
  danger:    'bg-status-blocked/10 text-status-blocked border border-status-blocked/30 hover:bg-status-blocked/20 focus-visible:ring-2 focus-visible:ring-status-blocked',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
}

const classes = computed(() =>
  clsx(
    'relative inline-flex items-center justify-center rounded-control font-sans',
    'transition-colors duration-fast outline-none',
    'disabled:opacity-50 disabled:pointer-events-none',
    'focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
    variantClasses[props.variant],
    sizeClasses[props.size],
    props.loading && 'cursor-wait',
  )
)

const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <button
    :type="type"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    :class="classes"
  >
    <!-- Spinner — rendered in-place, label remains for stable width -->
    <span
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <svg
        class="animate-spin h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          class="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor"
          stroke-width="3"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
    </span>

    <span :class="loading ? 'invisible' : 'contents'">
      <slot />
    </span>
  </button>
</template>
