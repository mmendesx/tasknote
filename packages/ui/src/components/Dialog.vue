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

const props = withDefaults(defineProps<{
  open?: boolean
  title: string
  description?: string
}>(), {
  open: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <!-- Trigger slot — caller provides the element that opens the dialog -->
    <slot name="trigger" />

    <DialogPortal>
      <!-- Backdrop -->
      <DialogOverlay class="tn-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />

      <!-- Panel -->
      <DialogContent
        class="tn-dialog fixed left-1/2 top-1/2 z-50 w-full max-w-md
               -translate-x-1/2 -translate-y-1/2
               rounded-modal border border-border bg-surface-elevated p-6 shadow-xl
               focus:outline-none"
      >
        <div class="mb-4">
          <DialogTitle class="text-base font-semibold text-text-primary leading-heading">
            {{ title }}
          </DialogTitle>
          <DialogDescription
            v-if="description"
            class="mt-1 text-sm text-text-secondary"
          >
            {{ description }}
          </DialogDescription>
        </div>

        <!-- Body -->
        <slot />

        <!-- Footer slot (actions) -->
        <div v-if="$slots.footer" class="mt-6 flex items-center justify-end gap-2">
          <slot name="footer" />
        </div>

        <!-- Default close button in top-right -->
        <DialogClose
          class="absolute right-4 top-4 rounded-control p-1
                 text-text-muted hover:text-text-primary transition-colors
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style="transition-duration: var(--motion-duration-fast)"
          aria-label="Close dialog"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
