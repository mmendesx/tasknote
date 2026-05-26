<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@tasknote/ui'
import { useAnime } from '@/composables/useAnime'

type SeedOption = 'empty' | 'sample'

const props = defineProps<{
  seed: SeedOption
  submitting?: boolean
}>()

const emit = defineEmits<{
  back: []
  finish: []
  'update:seed': [value: SeedOption]
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

function selectSeed(option: SeedOption) {
  emit('update:seed', option)
}
</script>

<template>
  <div ref="containerRef" class="step-seed">
    <div class="step-seed__options" role="radiogroup" aria-label="Starting point">
      
      <button
        type="button"
        class="seed-card"
        :class="{ 'seed-card--selected': seed === 'empty' }"
        role="radio"
        :aria-checked="seed === 'empty'"
        @click="selectSeed('empty')"
      >
        <span class="seed-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
            <rect
              x="3" y="3" width="18" height="18" rx="3"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </span>
        <span class="seed-card__body">
          <span class="seed-card__title">Start empty</span>
          <span class="seed-card__desc">A blank board, ready for your own columns and tasks.</span>
        </span>
        <span class="seed-card__check" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
            <path
              d="M3 8l3.5 3.5L13 5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>

      <button
        type="button"
        class="seed-card"
        :class="{ 'seed-card--selected': seed === 'sample' }"
        role="radio"
        :aria-checked="seed === 'sample'"
        @click="selectSeed('sample')"
      >
        <span class="seed-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
            <rect x="2" y="4" width="5" height="16" rx="1" stroke="currentColor" stroke-width="1.5" />
            <rect x="9.5" y="4" width="5" height="11" rx="1" stroke="currentColor" stroke-width="1.5" />
            <rect x="17" y="4" width="5" height="14" rx="1" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </span>
        <span class="seed-card__body">
          <span class="seed-card__title">Create sample board</span>
          <span class="seed-card__desc">A board with 4 columns and 3 example tasks to explore the app.</span>
        </span>
        <span class="seed-card__check" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
            <path
              d="M3 8l3.5 3.5L13 5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>
    </div>

    <div class="step-seed__actions">
      <Button variant="ghost" size="md" @click="emit('back')">
        Back
      </Button>
      <Button variant="primary" size="md" :loading="submitting" @click="emit('finish')">
        Finish
      </Button>
    </div>
  </div>
</template>

<style scoped>
.step-seed {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.step-seed__options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.seed-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  border: 1.5px solid var(--color-border);
  background-color: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--motion-duration-fast) var(--motion-easing),
    background-color var(--motion-duration-fast) var(--motion-easing);
  width: 100%;
}

.seed-card:hover {
  border-color: var(--color-text-muted);
  background-color: var(--color-surface-elevated);
}

.seed-card--selected {
  border-color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
}

.seed-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.seed-card__icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
  margin-top: 1px;
}

.seed-card--selected .seed-card__icon {
  color: var(--color-accent);
}

.seed-card__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.seed-card__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: var(--leading-heading);
}

.seed-card__desc {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  line-height: var(--leading-body);
}

.seed-card__check {
  color: var(--color-accent);
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-easing);
}

.seed-card--selected .seed-card__check {
  opacity: 1;
}

.step-seed__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
