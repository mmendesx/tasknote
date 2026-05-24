<script setup lang="ts">
/**
 * Shim — re-exports the canonical MilkdownEditor from features/editor/.
 * This file exists only for backwards-compatibility with TaskDrawer.vue (ICT-19).
 * Import the canonical version directly:
 *   import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'
 */
import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'

defineOptions({ name: 'MilkdownEditorShim' })
</script>

<template>
  <MilkdownEditor v-bind="$attrs" />
</template>
