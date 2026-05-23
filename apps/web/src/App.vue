<script setup lang="ts">
import { watch } from 'vue'
import { RouterView } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { Toast } from '@tasknote/ui'
import { useSettingsStore } from '@/stores'
import { useTheme } from '@/composables/useTheme'

// Theme is initialised from localStorage at module-load time in useTheme.ts,
// setting data-theme on <html> before any component renders.
const { setTheme } = useTheme()
const settingsStore = useSettingsStore()

// Once settings are loaded from the API, sync the theme ref so the composable
// and localStorage both reflect the server-stored preference.
watch(
  () => settingsStore.settings?.theme,
  (serverTheme) => {
    if (serverTheme) setTheme(serverTheme)
  },
  { immediate: true }
)
</script>

<template>
  <!-- Global toast container — mounted once at app root -->
  <Toast />

  <!-- All views render inside the shell layout -->
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
</template>
