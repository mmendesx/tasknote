<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Button, Input, Select } from '@tasknote/ui'
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

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Pacific/Midway',        label: 'Midway Island (UTC-11)' },
  { value: 'Pacific/Honolulu',      label: 'Hawaii (UTC-10)' },
  { value: 'America/Anchorage',     label: 'Alaska (UTC-9)' },
  { value: 'America/Los_Angeles',   label: 'Pacific Time — US & Canada (UTC-8/-7)' },
  { value: 'America/Denver',        label: 'Mountain Time — US & Canada (UTC-7/-6)' },
  { value: 'America/Phoenix',       label: 'Arizona (UTC-7, no DST)' },
  { value: 'America/Chicago',       label: 'Central Time — US & Canada (UTC-6/-5)' },
  { value: 'America/New_York',      label: 'Eastern Time — US & Canada (UTC-5/-4)' },
  { value: 'America/Halifax',       label: 'Atlantic Time — Canada (UTC-4/-3)' },
  { value: 'America/St_Johns',      label: 'Newfoundland (UTC-3:30/-2:30)' },
  { value: 'America/Sao_Paulo',     label: 'Brasília (UTC-3/-2)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Noronha',       label: 'Mid-Atlantic (UTC-2)' },
  { value: 'Atlantic/Azores',       label: 'Azores (UTC-1/0)' },
  { value: 'Atlantic/Cape_Verde',   label: 'Cape Verde Islands (UTC-1)' },
  { value: 'UTC',                   label: 'UTC — Coordinated Universal Time' },
  { value: 'Europe/London',         label: 'London, Edinburgh (UTC+0/+1)' },
  { value: 'Europe/Lisbon',         label: 'Lisbon (UTC+0/+1)' },
  { value: 'Africa/Casablanca',     label: 'Casablanca (UTC+1)' },
  { value: 'Europe/Paris',          label: 'Paris, Berlin, Amsterdam, Brussels (UTC+1/+2)' },
  { value: 'Europe/Rome',           label: 'Rome, Madrid, Stockholm (UTC+1/+2)' },
  { value: 'Europe/Warsaw',         label: 'Warsaw, Prague, Budapest (UTC+1/+2)' },
  { value: 'Africa/Lagos',          label: 'West Africa (UTC+1)' },
  { value: 'Europe/Athens',         label: 'Athens, Bucharest, Istanbul (UTC+2/+3)' },
  { value: 'Africa/Cairo',          label: 'Cairo (UTC+2)' },
  { value: 'Africa/Johannesburg',   label: 'Pretoria, Harare (UTC+2)' },
  { value: 'Europe/Helsinki',       label: 'Helsinki, Riga, Tallinn (UTC+2/+3)' },
  { value: 'Europe/Moscow',         label: 'Moscow, St. Petersburg (UTC+3)' },
  { value: 'Asia/Riyadh',           label: 'Kuwait, Riyadh (UTC+3)' },
  { value: 'Africa/Nairobi',        label: 'Nairobi (UTC+3)' },
  { value: 'Asia/Tehran',           label: 'Tehran (UTC+3:30/+4:30)' },
  { value: 'Asia/Dubai',            label: 'Abu Dhabi, Muscat (UTC+4)' },
  { value: 'Asia/Tbilisi',          label: 'Tbilisi (UTC+4)' },
  { value: 'Asia/Kabul',            label: 'Kabul (UTC+4:30)' },
  { value: 'Asia/Karachi',          label: 'Karachi, Islamabad (UTC+5)' },
  { value: 'Asia/Tashkent',         label: 'Tashkent (UTC+5)' },
  { value: 'Asia/Kolkata',          label: 'Mumbai, New Delhi, Kolkata (UTC+5:30)' },
  { value: 'Asia/Kathmandu',        label: 'Kathmandu (UTC+5:45)' },
  { value: 'Asia/Dhaka',            label: 'Dhaka (UTC+6)' },
  { value: 'Asia/Almaty',           label: 'Almaty (UTC+6)' },
  { value: 'Asia/Rangoon',          label: 'Yangon / Rangoon (UTC+6:30)' },
  { value: 'Asia/Bangkok',          label: 'Bangkok, Hanoi, Jakarta (UTC+7)' },
  { value: 'Asia/Krasnoyarsk',      label: 'Krasnoyarsk (UTC+7)' },
  { value: 'Asia/Shanghai',         label: 'Beijing, Shanghai, Chongqing (UTC+8)' },
  { value: 'Asia/Taipei',           label: 'Taipei (UTC+8)' },
  { value: 'Asia/Kuala_Lumpur',     label: 'Kuala Lumpur, Singapore (UTC+8)' },
  { value: 'Australia/Perth',       label: 'Perth (UTC+8)' },
  { value: 'Asia/Seoul',            label: 'Seoul (UTC+9)' },
  { value: 'Asia/Tokyo',            label: 'Osaka, Sapporo, Tokyo (UTC+9)' },
  { value: 'Asia/Yakutsk',          label: 'Yakutsk (UTC+9)' },
  { value: 'Australia/Adelaide',    label: 'Adelaide (UTC+9:30/+10:30)' },
  { value: 'Australia/Darwin',      label: 'Darwin (UTC+9:30, no DST)' },
  { value: 'Australia/Brisbane',    label: 'Brisbane (UTC+10, no DST)' },
  { value: 'Australia/Sydney',      label: 'Sydney, Melbourne, Canberra (UTC+10/+11)' },
  { value: 'Pacific/Guam',          label: 'Guam, Port Moresby (UTC+10)' },
  { value: 'Asia/Vladivostok',      label: 'Vladivostok (UTC+10)' },
  { value: 'Pacific/Noumea',        label: 'New Caledonia (UTC+11)' },
  { value: 'Asia/Magadan',          label: 'Magadan (UTC+11)' },
  { value: 'Pacific/Auckland',      label: 'Auckland, Wellington (UTC+12/+13)' },
  { value: 'Pacific/Fiji',          label: 'Fiji (UTC+12/+13)' },
  { value: 'Pacific/Tongatapu',     label: "Nuku'alofa (UTC+13)" },
]

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

      <Select
        id="tz-select"
        label="Timezone"
        :model-value="timezone"
        :options="TIMEZONES"
        :error="timezoneError"
        @update:model-value="emit('update:timezone', String($event))"
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
