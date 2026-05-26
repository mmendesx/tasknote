<script setup lang="ts">

import MilkdownEditor from '@/features/editor/MilkdownEditor.vue'

defineOptions({ name: 'MilkdownEditorShim' })
</script>

<template>
  <MilkdownEditor v-bind="$attrs" />
</template>
