<script setup lang="ts">
/**
 * DatePicker — calendar popover bound to a YYYY-MM-DD string.
 * Uses Reka-UI DatePickerRoot primitives for a11y + keyboard nav.
 * v-model: string ('YYYY-MM-DD' or '' for none).
 */
import { computed, ref } from 'vue'
import {
  DatePickerRoot,
  DatePickerAnchor,
  DatePickerContent,
  DatePickerCalendar,
  DatePickerHeader,
  DatePickerPrev,
  DatePickerNext,
  DatePickerHeading,
  DatePickerGrid,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerGridBody,
  DatePickerCell,
  DatePickerCellTrigger,
} from 'reka-ui'
import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

const props = withDefaults(defineProps<{
  modelValue?: string   // YYYY-MM-DD or ''
  label?: string
  placeholder?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Pick a date',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Convert YYYY-MM-DD string ↔ CalendarDate
const calendarValue = computed<CalendarDate | undefined>(() => {
  if (!props.modelValue) return undefined
  try { return parseDate(props.modelValue) } catch { return undefined }
})

function onUpdate(val: DateValue | undefined) {
  emit('update:modelValue', val ? val.toString() : '')
}

// Display label on trigger button
const displayValue = computed(() => {
  if (!props.modelValue) return ''
  try {
    return new Date(props.modelValue + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch { return props.modelValue }
})

function clearDate(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', '')
}

const open = ref(false)
function toggleOpen(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  open.value = !open.value
}
</script>

<template>
  <div class="dp-wrapper">
    <label v-if="label" class="dp-label">{{ label }}</label>

    <DatePickerRoot
      :model-value="calendarValue"
      :open="open"
      :disabled="disabled"
      @update:model-value="onUpdate"
      @update:open="open = $event"
    >
      <div class="dp-trigger-wrap">
        <button
          type="button"
          class="dp-trigger"
          :class="{ 'dp-trigger--empty': !modelValue, 'dp-trigger--disabled': disabled }"
          :disabled="disabled"
          :aria-expanded="open"
          aria-haspopup="dialog"
          @click="toggleOpen($event as MouseEvent)"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true" class="dp-trigger__icon">
            <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/>
            <path d="M1 7h14" stroke="currentColor" stroke-width="1.4"/>
            <path d="M5 1v4M11 1v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <span class="dp-trigger__text">{{ displayValue || placeholder }}</span>
        </button>
        <DatePickerAnchor as-child>
          <span class="dp-anchor" aria-hidden="true" />
        </DatePickerAnchor>
        <button
          v-if="modelValue && !disabled"
          type="button"
          class="dp-clear"
          aria-label="Clear date"
          @click="clearDate($event as MouseEvent)"
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Popover calendar panel -->
      <DatePickerContent
        :side-offset="6"
        align="start"
        class="dp-content"
      >
        <DatePickerCalendar v-slot="{ weekDays, grid }">
          <DatePickerHeader class="dp-header">
            <DatePickerPrev class="dp-nav-btn" aria-label="Previous month">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </DatePickerPrev>
            <DatePickerHeading class="dp-heading" />
            <DatePickerNext class="dp-nav-btn" aria-label="Next month">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </DatePickerNext>
          </DatePickerHeader>

          <DatePickerGrid
            v-for="month in grid"
            :key="month.value.toString()"
            class="dp-grid"
          >
            <DatePickerGridHead>
              <DatePickerGridRow class="dp-week-row">
                <DatePickerHeadCell
                  v-for="day in weekDays"
                  :key="day"
                  class="dp-head-cell"
                >
                  {{ day }}
                </DatePickerHeadCell>
              </DatePickerGridRow>
            </DatePickerGridHead>

            <DatePickerGridBody>
              <DatePickerGridRow
                v-for="(week, wIdx) in month.rows"
                :key="wIdx"
                class="dp-week-row"
              >
                <DatePickerCell
                  v-for="day in week"
                  :key="day.toString()"
                  :date="day"
                  class="dp-cell"
                >
                  <DatePickerCellTrigger
                    :day="day"
                    :month="month.value"
                    class="dp-day"
                  />
                </DatePickerCell>
              </DatePickerGridRow>
            </DatePickerGridBody>
          </DatePickerGrid>
        </DatePickerCalendar>
      </DatePickerContent>
    </DatePickerRoot>
  </div>
</template>

<style scoped>
.dp-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dp-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.dp-trigger-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
}

.dp-anchor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* ── Trigger button ──────────────────────────────────────────────────────── */
.dp-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  padding-right: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-duration-fast);
  font-family: inherit;
}

.dp-trigger:hover:not(.dp-trigger--disabled) {
  border-color: var(--color-text-muted);
}

.dp-trigger:focus-visible {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.dp-trigger--empty .dp-trigger__text {
  color: var(--color-text-muted);
}

.dp-trigger--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dp-trigger__icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.dp-trigger__text {
  flex: 1;
}

.dp-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  /* FR-14: 24×24 minimum touch target */
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--motion-duration-fast), background-color var(--motion-duration-fast);
}

.dp-clear:hover {
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, var(--color-text-primary) 10%, transparent);
}

</style>

<style>
/* Popover content is rendered in a Portal at <body>, so these rules MUST be
   non-scoped — scoped selectors with data-v-* won't match portaled DOM. */
.dp-content {
  z-index: 200;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-elevated);
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  width: 260px;
}

.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.dp-heading {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.dp-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--motion-duration-fast), color var(--motion-duration-fast);
}

.dp-nav-btn:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
}

.dp-nav-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.dp-grid {
  width: 100%;
}

.dp-week-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 2px;
}

.dp-head-cell {
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  padding-bottom: 6px;
}

.dp-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dp-day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--motion-duration-fast), color var(--motion-duration-fast);
}

.dp-day:hover:not([data-disabled]):not([data-selected]) {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
}

.dp-day[data-selected] {
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 600;
}

.dp-day[data-today]:not([data-selected]) {
  border: 1.5px solid var(--color-accent);
  color: var(--color-accent);
}

.dp-day[data-disabled] {
  opacity: 0.3;
  cursor: not-allowed;
}

.dp-day[data-outside-view] {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.dp-day:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
</style>
