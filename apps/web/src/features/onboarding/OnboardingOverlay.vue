<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
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

const KNOWN_TIMEZONES = [
  'Pacific/Midway','Pacific/Honolulu','America/Anchorage','America/Los_Angeles',
  'America/Denver','America/Phoenix','America/Chicago','America/New_York',
  'America/Halifax','America/St_Johns','America/Sao_Paulo',
  'America/Argentina/Buenos_Aires','America/Noronha','Atlantic/Azores',
  'Atlantic/Cape_Verde','UTC','Europe/London','Europe/Lisbon','Africa/Casablanca',
  'Europe/Paris','Europe/Rome','Europe/Warsaw','Africa/Lagos','Europe/Athens',
  'Africa/Cairo','Africa/Johannesburg','Europe/Helsinki','Europe/Moscow',
  'Asia/Riyadh','Africa/Nairobi','Asia/Tehran','Asia/Dubai','Asia/Tbilisi',
  'Asia/Kabul','Asia/Karachi','Asia/Tashkent','Asia/Kolkata','Asia/Kathmandu',
  'Asia/Dhaka','Asia/Almaty','Asia/Rangoon','Asia/Bangkok','Asia/Krasnoyarsk',
  'Asia/Shanghai','Asia/Taipei','Asia/Kuala_Lumpur','Australia/Perth','Asia/Seoul',
  'Asia/Tokyo','Asia/Yakutsk','Australia/Adelaide','Australia/Darwin',
  'Australia/Brisbane','Australia/Sydney','Pacific/Guam','Asia/Vladivostok',
  'Pacific/Noumea','Asia/Magadan','Pacific/Auckland','Pacific/Fiji','Pacific/Tongatapu',
]

function getSystemTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return KNOWN_TIMEZONES.includes(tz) ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

const stepTitles: Record<Step, string> = {
  1: 'Welcome to TaskNote',
  2: 'Your profile',
  3: 'Get started',
}

const dialogTitle = computed(() => stepTitles[currentStep.value])
const stepContentRef = ref<HTMLElement | null>(null)

function goToStep(step: Step) {
  currentStep.value = step
  
  nextTick(() => {
    const el = stepContentRef.value?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    el?.focus()
  })
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

      <div ref="stepContentRef">
        
        <StepWelcome
          v-if="currentStep === 1"
          @next="goToStep(2)"
        />

        <StepProfile
          v-else-if="currentStep === 2"
          :display-name="displayName"
          :timezone="timezone"
          @update:display-name="displayName = $event"
          @update:timezone="timezone = $event"
          @back="goToStep(1)"
          @next="handleProfileNext"
        />

        <StepSeed
          v-else-if="currentStep === 3"
          :seed="seed"
          :submitting="isSubmitting"
          @update:seed="seed = $event"
          @back="goToStep(2)"
          @finish="handleFinish"
        />
      </div>
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
