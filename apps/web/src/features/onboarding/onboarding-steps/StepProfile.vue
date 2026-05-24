<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Button, Input } from '@tasknote/ui'
import { useAnime } from '@/composables/useAnime'

const props = defineProps<{
  displayName: string
  timezone: string
}>()

const emit = defineEmits<{
  back: []
  next: [displayName: string, timezone: string]
  'update:displayName': [value: string]
  'update:timezone': [value: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
const displayNameError = ref('')
const timezoneError = ref('')
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

const isValid = computed(() => {
  const name = props.displayName.trim()
  const tz = props.timezone.trim()
  return name.length >= 1 && name.length <= 50 && tz.length >= 1
})

function validateAndNext() {
  displayNameError.value = ''
  timezoneError.value = ''

  const name = props.displayName.trim()
  const tz = props.timezone.trim()

  let hasError = false

  if (name.length < 1) {
    displayNameError.value = 'Your name is required'
    hasError = true
  } else if (name.length > 50) {
    displayNameError.value = 'Name must be 50 characters or fewer'
    hasError = true
  }

  if (tz.length < 1) {
    timezoneError.value = 'Timezone is required'
    hasError = true
  }

  if (!hasError) {
    emit('next', name, tz)
  }
}
</script>

<template>
  <div ref="containerRef" class="step-profile">
    <div class="step-profile__fields">
      <Input
        label="Your name"
        :model-value="displayName"
        placeholder="e.g. Alex"
        :error="displayNameError"
        @update:model-value="emit('update:displayName', $event)"
      />

      <Input
        label="Timezone"
        :model-value="timezone"
        placeholder="e.g. America/New_York"
        :error="timezoneError"
        @update:model-value="emit('update:timezone', $event)"
      />
    </div>

    <div class="step-profile__actions">
      <Button variant="ghost" size="md" @click="emit('back')">
        Back
      </Button>
      <Button
        variant="primary"
        size="md"
        :disabled="!isValid"
        @click="validateAndNext"
      >
        Next
      </Button>
    </div>
  </div>
</template>

<style scoped>
.step-profile {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.step-profile__fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-profile__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
