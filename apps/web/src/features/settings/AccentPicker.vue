<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores'

const ACCENT_PRESETS = [
  { name: 'Lime',   hex: '#A3E635' },
  { name: 'Sky',    hex: '#38BDF8' },
  { name: 'Violet', hex: '#A78BFA' },
  { name: 'Rose',   hex: '#FB7185' },
  { name: 'Amber',  hex: '#FBBF24' },
] as const

type AccentHex = typeof ACCENT_PRESETS[number]['hex']

const settingsStore = useSettingsStore()

const currentAccent = computed(() => settingsStore.settings?.accent ?? '#A3E635')

async function pickAccent(hex: AccentHex) {
  document.documentElement.style.setProperty('--color-accent', hex)
  await settingsStore.update({ accent: hex })
}
</script>

<template>
  <div class="flex items-center gap-3" role="radiogroup" aria-label="Accent color">
    <button
      v-for="preset in ACCENT_PRESETS"
      :key="preset.hex"
      type="button"
      role="radio"
      :aria-checked="currentAccent === preset.hex"
      :aria-label="preset.name"
      :title="preset.name"
      class="relative h-7 w-7 rounded-full border-2 transition-transform duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      :class="currentAccent === preset.hex ? 'border-text-primary scale-110' : 'border-transparent hover:scale-105'"
      :style="{ backgroundColor: preset.hex, '--tw-ring-color': preset.hex }"
      @click="pickAccent(preset.hex)"
    >
      <!-- Checkmark for selected state -->
      <span
        v-if="currentAccent === preset.hex"
        class="absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
          <path
            d="M2 6l3 3 5-5"
            stroke="#000"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="opacity: 0.7"
          />
        </svg>
      </span>
    </button>
  </div>
</template>
