<script setup lang="ts">
defineProps<{
  keys: string | string[]
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <template v-if="Array.isArray(keys)">
      <kbd
        v-for="(key, i) in keys"
        :key="i"
        class="inline-flex items-center justify-center rounded px-1.5 py-0.5
               text-xs font-mono font-medium text-text-secondary
               bg-surface-elevated border border-border
               shadow-[0_1px_0_0_var(--color-border)]
               min-w-[1.25rem]"
      >{{ key }}</kbd>
    </template>
    <kbd
      v-else
      class="inline-flex items-center justify-center rounded px-1.5 py-0.5
             text-xs font-mono font-medium text-text-secondary
             bg-surface-elevated border border-border
             shadow-[0_1px_0_0_var(--color-border)]
             min-w-[1.25rem]"
    >{{ keys }}</kbd>
  </span>
</template>
