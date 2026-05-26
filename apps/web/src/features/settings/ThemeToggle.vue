<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useSettingsStore } from '@/stores'
import { useAnime } from '@/composables/useAnime'

const { theme, setTheme } = useTheme()
const settingsStore = useSettingsStore()
const { animate } = useAnime()

const rippleRef = ref<HTMLSpanElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

async function selectTheme(next: 'dark' | 'light', event: MouseEvent) {
  if (theme.value === next) return

  if (rippleRef.value && containerRef.value) {
    const container = containerRef.value.getBoundingClientRect()
    const btn = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = btn.left - container.left + btn.width / 2
    const cy = btn.top - container.top + btn.height / 2
    const maxDim = Math.max(container.width, container.height) * 2

    const el = rippleRef.value
    el.style.left = `${cx}px`
    el.style.top = `${cy}px`
    el.style.width = '4px'
    el.style.height = '4px'
    el.style.opacity = '0.3'
    el.style.display = 'block'

    animate(el, {
      width: maxDim,
      height: maxDim,
      left: cx - maxDim / 2,
      top: cy - maxDim / 2,
      opacity: [0.3, 0],
      duration: 300,
      easing: 'easeOutCubic',
    })
  }

  setTheme(next)
  await settingsStore.update({ theme: next })
}
</script>

<template>
  <div ref="containerRef" class="relative inline-flex overflow-hidden rounded-control border border-border" role="group" aria-label="Theme">
    
    <span
      ref="rippleRef"
      aria-hidden="true"
      class="pointer-events-none absolute hidden rounded-full"
      style="background-color: var(--color-accent); transform: translate(-50%, -50%); transform-origin: center"
    />

    <button
      type="button"
      role="radio"
      :aria-checked="theme === 'dark'"
      class="relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      :class="theme === 'dark' ? 'bg-surface-elevated text-text-primary font-medium' : 'bg-transparent text-text-muted hover:text-text-secondary'"
      @click="selectTheme('dark', $event)"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M12.7 11.3a7 7 0 1 1-8-8A5.5 5.5 0 0 0 12.7 11.3z"/>
      </svg>
      Dark
    </button>

    <button
      type="button"
      role="radio"
      :aria-checked="theme === 'light'"
      class="relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      :class="theme === 'light' ? 'bg-surface-elevated text-text-primary font-medium' : 'bg-transparent text-text-muted hover:text-text-secondary'"
      @click="selectTheme('light', $event)"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="8" r="3.5"/>
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M3.22 12.78l1.42-1.42M11.36 4.64l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      Light
    </button>
  </div>
</template>
