<script setup lang="ts">
import { RouterView } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { Toast } from '@tasknote/ui'

// Theme is initialized at module load time in useTheme.ts,
// which sets data-theme on <html> before any component renders.
// No explicit call needed here — the effect runs on import.
</script>

<template>
  <!-- Global toast container — mounted once at app root -->
  <Toast />

  <!-- All views render inside the shell layout -->
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
</template>
