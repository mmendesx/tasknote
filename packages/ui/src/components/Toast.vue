<script setup lang="ts">
import {
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastViewport,
} from 'reka-ui'
import { useToast, type ToastVariant } from './useToast'

/**
 * Toast — mount once in the app root (e.g., App.vue).
 * Reads from the shared toast state and renders all active toasts.
 * Reka's ToastRoot manages open/close lifecycle internally via duration.
 * Use useToast() composable to dispatch toasts from anywhere.
 */
const { toasts, dismiss } = useToast()

const variantClasses: Record<ToastVariant, string> = {
  default: 'border-border text-text-primary',
  success: 'border-status-done/30 text-status-done',
  error:   'border-status-blocked/30 text-status-blocked',
  warning: 'border-status-doing/30 text-status-doing',
}

const iconMap: Record<ToastVariant, string> = {
  default: '',
  success: '✓',
  error:   '✕',
  warning: '⚠',
}
</script>

<template>
  <ToastProvider :duration="4000">
    <ToastRoot
      v-for="toast in toasts"
      :key="toast.id"
      :duration="toast.duration"
      :default-open="true"
      class="tn-toast group relative flex items-start gap-3 rounded-card border px-4 py-3
             shadow-lg w-80 bg-surface-elevated focus:outline-none"
      :class="variantClasses[toast.variant]"
      @update:open="(open) => { if (!open) dismiss(toast.id) }"
    >
      <!-- Variant icon -->
      <span
        v-if="iconMap[toast.variant]"
        class="mt-0.5 text-sm font-bold flex-shrink-0"
        aria-hidden="true"
      >
        {{ iconMap[toast.variant] }}
      </span>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <ToastTitle class="text-sm font-medium">
          {{ toast.title }}
        </ToastTitle>
        <ToastDescription v-if="toast.description" class="mt-0.5 text-xs text-text-secondary">
          {{ toast.description }}
        </ToastDescription>
      </div>

      <!-- Close -->
      <ToastClose
        :aria-label="`Dismiss: ${toast.title}`"
        class="flex-shrink-0 rounded-sm p-0.5 text-text-muted hover:text-text-primary
               transition-opacity opacity-0 group-hover:opacity-100
               focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        style="transition-duration: var(--motion-duration-fast)"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </ToastClose>
    </ToastRoot>

    <!-- Viewport: portal target for stacking toasts -->
    <ToastViewport
      class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 outline-none"
    />
  </ToastProvider>
</template>
