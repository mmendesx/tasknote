<script setup lang="ts">
import clsx from 'clsx'

const props = withDefaults(defineProps<{
  label: string
  removable?: boolean
  missing?: boolean
  href?: string
}>(), {
  removable: false,
  missing: false,
})

const emit = defineEmits<{
  remove: []
}>()

const chipClasses = clsx(
  'inline-flex items-center gap-1.5 rounded-control px-2 py-0.5',
  'text-xs font-medium font-mono',
  'bg-surface-elevated border border-border',
  'text-text-secondary',
)
</script>

<template>
  <span :class="[chipClasses, missing && 'opacity-50 line-through']">
    <!-- Missing file indicator -->
    <span
      v-if="missing"
      class="h-1.5 w-1.5 rounded-full bg-status-blocked flex-shrink-0"
      aria-label="File missing"
    />

    <a
      v-if="href && !missing"
      :href="href"
      class="truncate max-w-[160px] hover:text-text-primary focus-visible:outline-none focus-visible:underline"
    >{{ label }}</a>
    <span v-else class="truncate max-w-[160px]">{{ label }}</span>

    <button
      v-if="removable"
      type="button"
      :aria-label="`Remove ${label}`"
      class="ml-0.5 rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      @click.stop="emit('remove')"
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </span>
</template>
