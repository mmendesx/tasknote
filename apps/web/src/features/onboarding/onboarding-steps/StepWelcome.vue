<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@tasknote/ui'
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
    <!-- Logo mark -->
    <div class="step-welcome__logo" aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        width="56"
        height="56"
        class="step-welcome__logo-svg"
      >
        <path
          d="M6 4 H22 L26 8 V28 H6 Z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          d="M22 4 L22 8 H26"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          d="M10 17 L14 21 L22 10"
          stroke="var(--color-accent)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <!-- Tagline -->
    <p class="step-welcome__tagline">Your work, your way — local.</p>

    <!-- CTA -->
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

.step-welcome__logo-svg {
  display: block;
}

.step-welcome__tagline {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
