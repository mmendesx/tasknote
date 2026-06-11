<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BrandMark, Button } from '@tasknote/ui'
import { useAnime } from '@/composables/useAnime'

const emit = defineEmits<{
  next: []
}>()

const containerRef = ref<HTMLElement | null>(null)
const { animate } = useAnime()

onMounted(() => {
  if (containerRef.value) {
    animate(containerRef.value, {
      translateY: [8, 0],
      opacity: [0, 1],
      duration: 200,
      easing: 'easeOutCubic',
    })
  }
})
</script>

<template>
  <div ref="containerRef" class="step-welcome">
    
    <div class="step-welcome__logo" aria-hidden="true">
      <BrandMark :size="56" />
    </div>

    <p class="step-welcome__tagline">Your work, your way — local.</p>

    <Button variant="primary" size="md" @click="emit('next')">
      Get started
    </Button>
  </div>
</template>

<style scoped>
.step-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 8px 0 4px;
  text-align: center;
}

.step-welcome__logo {
  color: var(--color-text-primary);
}

.step-welcome__tagline {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
