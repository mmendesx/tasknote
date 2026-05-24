<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { Toast } from '@tasknote/ui'
import { useSettingsStore } from '@/stores'
import { useTheme } from '@/composables/useTheme'
import { animateOrSkip } from '@/composables/useAnime'
import OnboardingOverlay from '@/features/onboarding/OnboardingOverlay.vue'
import CommandPalette from '@/features/search/CommandPalette.vue'
import { useCommandPalette } from '@/features/search/useCommandPalette'
import ShortcutCheatsheet from '@/features/shortcuts/ShortcutCheatsheet.vue'
import { useShortcuts, onShortcut } from '@/composables/useShortcuts'

// Theme is initialised from localStorage at module-load time in useTheme.ts,
// setting data-theme on <html> before any component renders.
const { setTheme } = useTheme()
const settingsStore = useSettingsStore()

// Controls whether the overlay is mounted. Separate from isOnboarded so we
// can animate it out before unmounting rather than removing it instantly.
const overlayMounted = ref(false)

// Once settings are loaded from the API, sync the theme ref so the composable
// and localStorage both reflect the server-stored preference.
watch(
  () => settingsStore.settings?.theme,
  (serverTheme) => {
    if (serverTheme) setTheme(serverTheme)
  },
  { immediate: true }
)

// Sync accent color CSS variable from settings so the stored hex is applied on
// every load — AccentPicker sets it immediately on pick, but this handles initial
// load and cross-tab sync.
watch(
  () => settingsStore.settings?.accent,
  (hex) => {
    if (hex) document.documentElement.style.setProperty('--color-accent', hex)
  },
  { immediate: true }
)

// When onboarding completes (isOnboarded flips true), fade the overlay out
// then unmount it.
watch(
  () => settingsStore.isOnboarded,
  (nowOnboarded) => {
    if (nowOnboarded && overlayMounted.value) {
      // The Dialog uses reka-ui's DialogPortal which teleports the backdrop
      // (.tn-overlay) and content panel (.tn-dialog) to document.body.
      // We animate those portaled nodes rather than the wrapper div.
      const dialogTargets = document.querySelectorAll('.tn-dialog, .tn-overlay')
      if (dialogTargets.length > 0) {
        const anim = animateOrSkip(Array.from(dialogTargets), {
          opacity: [1, 0],
          duration: 250,
          easing: 'easeOutCubic',
        })
        // anime.js v4 animation instances expose a `.finished` Promise
        const finished: Promise<unknown> =
          (anim as { finished?: Promise<unknown> }).finished ?? Promise.resolve()
        finished.then(() => {
          overlayMounted.value = false
        })
      } else {
        overlayMounted.value = false
      }
    }
  }
)

// ─── Shortcut cheatsheet ───────────────────────────────────────────────────────
const cheatsheetOpen = ref(false)

// ─── Global shortcut layer ─────────────────────────────────────────────────────
const { install: installShortcuts } = useShortcuts()

onMounted(async () => {
  await settingsStore.load()
  // Show overlay only when settings are loaded and user has not yet onboarded
  if (!settingsStore.isOnboarded) {
    overlayMounted.value = true
  }

  // Install keyboard shortcut layer after DOM is ready
  installShortcuts()

  // Subscribe to cheatsheet shortcut — toggle modal open/closed
  onShortcut('cheatsheet', () => {
    cheatsheetOpen.value = !cheatsheetOpen.value
  })
})

// Command palette — open state is owned by the singleton composable so that
// ICT-20 (useShortcuts) can call openPalette() from anywhere.
const { open: paletteOpen } = useCommandPalette()
</script>

<template>
  <!-- Global toast container — mounted once at app root -->
  <Toast />

  <!-- Command palette — rendered at root so it overlays any view -->
  <CommandPalette v-model:open="paletteOpen" />

  <!-- Shortcut cheatsheet modal — toggled by '?' shortcut -->
  <ShortcutCheatsheet v-model:open="cheatsheetOpen" />

  <!-- Onboarding overlay — shown above the layout until onboarded -->
  <div v-if="overlayMounted" class="tn-onboarding-root">
    <OnboardingOverlay />
  </div>

  <!-- All views render inside the shell layout -->
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
</template>
