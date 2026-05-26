<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'

/**
 * Drawer — a right-anchored panel built on Reka's DialogRoot.
 * Slide animation honours prefers-reduced-motion via --motion-duration-base (0ms when reduced).
 * Reka's DialogRoot provides focus trap, aria-modal, and Escape key handling.
 */
const props = withDefaults(defineProps<{
  open?: boolean
  title: string
  description?: string
  width?: string
}>(), {
  open: false,
  width: '28rem',
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <slot name="trigger" />

    <DialogPortal>
      <!-- Backdrop -->
      <DialogOverlay class="tn-overlay fixed inset-0 z-40 bg-black/50" />

      <!-- Drawer panel — slides in from the right via .tn-drawer animation -->
      <DialogContent
        class="tn-drawer fixed inset-y-0 right-0 z-50 flex flex-col
               border-l border-border bg-surface-elevated shadow-xl focus:outline-none"
        :style="{ width, maxWidth: '100vw' }"
      >
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <DialogTitle class="text-base font-semibold text-text-primary leading-heading">
              {{ title }}
            </DialogTitle>
            <!-- Always render DialogDescription for a11y (hidden when no prop provided) -->
            <DialogDescription
              :class="description ? 'mt-0.5 text-sm text-text-secondary' : 'sr-only'"
            >
              {{ description || `${title} panel` }}
            </DialogDescription>
          </div>

          <DialogClose
            class="mt-0.5 rounded-control p-1 text-text-muted hover:text-text-primary
                   transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style="transition-duration: var(--motion-duration-fast)"
            aria-label="Close drawer"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </DialogClose>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <slot />
        </div>

        <!-- Footer -->
        <div v-if="$slots.footer" class="border-t border-border px-6 py-4 flex items-center justify-end gap-2">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
