<script setup lang="ts">
import { computed, useId } from 'vue'
import clsx from 'clsx'

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  error?: string
  rows?: number
  id?: string
}>(), {
  disabled: false,
  readonly: false,
  rows: 4,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const autoId = useId()
const textareaId = computed(() => props.id ?? autoId)
const errorId = computed(() => `${textareaId.value}-error`)
const hasError = computed(() => Boolean(props.error))

const textareaClasses = computed(() =>
  clsx(
    'w-full rounded-control border bg-surface px-3 py-2',
    'font-sans text-sm text-text-primary placeholder:text-text-muted',
    'transition-colors duration-fast outline-none resize-y',
    'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    hasError.value
      ? 'border-status-blocked focus-visible:ring-status-blocked'
      : 'border-border hover:border-text-muted',
  )
)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      :for="textareaId"
      class="text-xs font-medium text-text-secondary"
    >
      {{ label }}
    </label>

    <textarea
      :id="textareaId"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :rows="rows"
      :class="textareaClasses"
      :aria-invalid="hasError || undefined"
      :aria-describedby="hasError ? errorId : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <slot name="hint" />

    <p
      v-if="hasError"
      :id="errorId"
      role="alert"
      class="text-xs text-status-blocked"
    >
      {{ error }}
    </p>
  </div>
</template>
