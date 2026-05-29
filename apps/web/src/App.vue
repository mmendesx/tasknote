<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useNavigationState } from '@/composables/useNavigationState'
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

const { setTheme } = useTheme()
const settingsStore = useSettingsStore()

const overlayMounted = ref(false)

watch(
  () => settingsStore.settings?.theme,
  (serverTheme) => {
    if (serverTheme) setTheme(serverTheme)
  },
  { immediate: true }
)

watch(
  () => settingsStore.settings?.accent,
  (hex) => {
    if (hex) document.documentElement.style.setProperty('--color-accent', hex)
  },
  { immediate: true }
)

watch(
  () => settingsStore.isOnboarded,
  (nowOnboarded) => {
    if (nowOnboarded && overlayMounted.value) {
      
      const dialogTargets = document.querySelectorAll('.tn-dialog, .tn-overlay')
      if (dialogTargets.length > 0) {
        const anim = animateOrSkip(Array.from(dialogTargets), {
          opacity: [1, 0],
          duration: 250,
          easing: 'easeOutCubic',
        })
        
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

const cheatsheetOpen = ref(false)

const { install: installShortcuts } = useShortcuts()

onMounted(async () => {
  await settingsStore.load()
  
  if (!settingsStore.isOnboarded) {
    overlayMounted.value = true
  }

  installShortcuts()

  onShortcut('cheatsheet', () => {
    cheatsheetOpen.value = !cheatsheetOpen.value
  })
})

const { open: paletteOpen } = useCommandPalette()

// FR-9: aria-live announcement for route changes (screen-reader navigation feedback)
const { routeLabel } = useNavigationState()
const routeAnnouncement = ref('')
watch(routeLabel, (label) => {
  routeAnnouncement.value = label ? `Navigated to ${label}` : ''
})
</script>

<template>
  <!-- FR-9: skip-to-content link for keyboard users -->
  <a href="#main-content" class="skip-link">Skip to main content</a>

  <!-- FR-9: aria-live region for route-change announcements -->
  <div
    class="sr-only"
    aria-live="polite"
    aria-atomic="true"
  >{{ routeAnnouncement }}</div>

  <Toast />

  <CommandPalette v-model:open="paletteOpen" />

  <ShortcutCheatsheet v-model:open="cheatsheetOpen" />

  <div v-if="overlayMounted" class="tn-onboarding-root">
    <OnboardingOverlay />
  </div>

  <DefaultLayout>
    <RouterView v-slot="{ Component }">
      <!-- No mode="out-in": it deadlocked after the Settings view — the leaving
           view's transitionend never fired, so the next view stayed unmounted
           (blank main content). Default simultaneous transition keeps the fade
           without gating the incoming view on the outgoing one's transition end. -->
      <Transition name="page">
        <component :is="Component" :key="$route.name" />
      </Transition>
    </RouterView>
  </DefaultLayout>
</template>

<style>
/* FR-9: skip-to-content link — visually hidden until focused */
.skip-link {
  position: fixed;
  top: -100%;
  left: 0.5rem;
  z-index: 9999;
  padding: 0.5rem 1rem;
  background: var(--color-surface);
  border: 2px solid var(--color-focus-ring);
  border-radius: var(--radius-control);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transition: top 0.1s;
}

.skip-link:focus {
  top: 0.5rem;
}

/* Utility: screen-reader only text */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--motion-duration-fast) var(--motion-easing),
    transform var(--motion-duration-fast) var(--motion-easing);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
