<script setup lang="ts">

import { ref, computed } from 'vue'
import { Input, Button } from '@tasknote/ui'
import { ABSOLUTE_PATH_PATTERN, FORBIDDEN_PATH_CHARS } from '@tasknote/shared'
import type { FileRef } from '@tasknote/shared'
import * as api from '@/api'

const props = defineProps<{
  taskId: number
}>()

const emit = defineEmits<{
  created: [fileRef: FileRef]
  cancel: []
}>()

const path    = ref('')
const label   = ref('')
const note    = ref('')
const loading = ref(false)

const pathError = computed<string | undefined>(() => {
  if (!path.value) return undefined
  if (!ABSOLUTE_PATH_PATTERN.test(path.value)) {
    return 'Path must be absolute (start with / or a Windows drive letter like C:\\)'
  }
  if (FORBIDDEN_PATH_CHARS.test(path.value)) {
    return 'Path must not contain shell metacharacters (; & | ` $ ( ) or newline)'
  }
  return undefined
})

const labelError = computed<string | undefined>(() => {
  if (!label.value) return undefined
  if (label.value.length > 200) return 'Label must be 200 characters or fewer'
  return undefined
})

const canSubmit = computed(
  () =>
    path.value.trim().length > 0 &&
    label.value.trim().length > 0 &&
    !pathError.value &&
    !labelError.value &&
    !loading.value
)

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  loading.value = true
  try {
    const fileRef = await api.fileRefs.createFileRef({
      target_type: 'task',
      target_id: props.taskId,
      path: path.value.trim(),
      label: label.value.trim(),
      note: note.value.trim() || null,
    })
    emit('created', fileRef)
    path.value  = ''
    label.value = ''
    note.value  = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="submit">

    <Input
      v-model="path"
      label="File path"
      placeholder="/Users/me/docs/spec.pdf"
      :error="path ? pathError : undefined"
      required
    />

    <Input
      v-model="label"
      label="Label"
      placeholder="Spec PDF"
      :error="label ? labelError : undefined"
      required
    />

    <Input
      v-model="note"
      label="Note (optional)"
      placeholder="Short description"
    />

    <div class="flex items-center gap-2">
      <Button type="submit" variant="primary" size="sm" :loading="loading" :disabled="!canSubmit">
        Add file
      </Button>
      <Button type="button" variant="ghost" size="sm" @click="emit('cancel')">
        Cancel
      </Button>
    </div>
  </form>
</template>

