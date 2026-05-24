<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog } from '@tasknote/ui'
import { useSettingsStore } from '@/stores'
import StepWelcome from './onboarding-steps/StepWelcome.vue'
import StepProfile from './onboarding-steps/StepProfile.vue'
import StepSeed from './onboarding-steps/StepSeed.vue'

type Step = 1 | 2 | 3

const settingsStore = useSettingsStore()

const currentStep = ref<Step>(1)
const displayName = ref('')
const timezone = ref(getSystemTimezone())
const seed = ref<'empty' | 'sample'>('empty')
const isSubmitting = ref(false)

function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const stepTitles: Record<Step, string> = {
  1: 'Welcome to TaskNote',
  2: 'Your profile',
  3: 'Getting started',
}

const dialogTitle = computed(() => stepTitles[currentStep.value])

function goToStep(step: Step) {
  currentStep.value = step
}

function handleProfileNext(name: string, tz: string) {
  displayName.value = name
  timezone.value = tz
  goToStep(3)
}

async function handleFinish() {
  isSubmitting.value = true
  try {
    await settingsStore.onboard({
      display_name: displayName.value.trim(),
      timezone: timezone.value.trim(),
      seed: seed.value,
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog
    :open="true"
    :title="dialogTitle"
    :closable="false"
    :dismissable="false"
  >
    <!-- Progress dots -->
    <template #default>
      <div class="onboarding-progress" aria-label="Step progress" role="group">
        <span
          v-for="step in 3"
          :key="step"
          class="progress-dot"
          :class="{ 'progress-dot--active': step === currentStep, 'progress-dot--done': step < currentStep }"
          :aria-label="`Step ${step}${step === currentStep ? ' (current)' : step < currentStep ? ' (completed)' : ''}`"
        />
      </div>

      <!-- Step 1: Welcome -->
      <StepWelcome
        v-if="currentStep === 1"
        @next="goToStep(2)"
      />

      <!-- Step 2: Profile -->
      <StepProfile
        v-else-if="currentStep === 2"
        :display-name="displayName"
        :timezone="timezone"
        @update:display-name="displayName = $event"
        @update:timezone="timezone = $event"
        @back="goToStep(1)"
        @next="handleProfileNext"
      />

      <!-- Step 3: Seed choice -->
      <StepSeed
        v-else-if="currentStep === 3"
        :seed="seed"
        :submitting="isSubmitting"
        @update:seed="seed = $event"
        @back="goToStep(2)"
        @finish="handleFinish"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.onboarding-progress {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 24px;
}

.progress-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-border);
  transition: background-color var(--motion-duration-fast) var(--motion-easing),
              transform var(--motion-duration-fast) var(--motion-easing);
}

.progress-dot--done {
  background-color: var(--color-accent);
  opacity: 0.5;
}

.progress-dot--active {
  background-color: var(--color-accent);
  transform: scale(1.4);
}
</style>
