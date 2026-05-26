<script setup lang="ts">

import { ref, onMounted, computed } from 'vue'
import { Button } from '@tasknote/ui'
import { useToast } from '@tasknote/ui'
import * as api from '@/api'
import type { FileRef } from '@tasknote/shared'

const props = defineProps<{
  fileRef: FileRef
}>()

const emit = defineEmits<{
  deleted: [id: number]
}>()

const toast = useToast()
const exists = ref<boolean | null>(null)
const confirmingDelete = ref(false)
const openLoading = ref(false)

const basename = computed(() =>
  props.fileRef.path.split(/[\\/]/).pop() ?? props.fileRef.path
)

onMounted(async () => {
  try {
    const result = await api.fileRefs.checkExists(props.fileRef.id)
    exists.value = result.exists
  } catch {
    exists.value = false
  }
})

async function openFile(): Promise<void> {
  openLoading.value = true
  try {
    await api.fileRefs.openFile(props.fileRef.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not open file'
    toast.error('Open failed', msg)
  } finally {
    openLoading.value = false
  }
}

async function confirmDelete(): Promise<void> {
  try {
    await api.fileRefs.deleteFileRef(props.fileRef.id)
    emit('deleted', props.fileRef.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not delete file reference'
    toast.error('Delete failed', msg)
  } finally {
    confirmingDelete.value = false
  }
}
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-control border border-border bg-surface p-3"
    :class="exists === false && 'opacity-60'"
  >
    
    <span
      class="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
      :class="
        exists === null
          ? 'bg-text-muted'
          : exists
          ? 'bg-status-done'
          : 'bg-status-blocked'
      "
      :aria-label="
        exists === null
          ? 'Checking file...'
          : exists
          ? 'File exists'
          : 'File missing'
      "
      role="img"
    />

    <div class="flex-1 min-w-0">
      <p
        class="truncate text-sm font-mono text-text-primary"
        :class="exists === false && 'line-through'"
      >
        {{ basename }}
      </p>
      <p v-if="fileRef.label" class="text-xs text-text-secondary truncate">
        {{ fileRef.label }}
      </p>
      <p v-if="exists === false" class="text-xs text-status-blocked mt-0.5" role="alert">
        File not found
      </p>
    </div>

    <div class="flex items-center gap-1 flex-shrink-0">
      <Button
        v-if="!confirmingDelete"
        size="sm"
        variant="ghost"
        :loading="openLoading"
        :disabled="exists === false"
        :title="exists === false ? 'File not found' : 'Open with default app'"
        @click="openFile"
      >
        Open
      </Button>

      <template v-if="!confirmingDelete">
        <Button
          size="sm"
          variant="ghost"
          title="Remove file reference"
          @click="confirmingDelete = true"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="sr-only">Remove</span>
        </Button>
      </template>
      <template v-else>
        <span class="text-xs text-text-secondary mr-1">Remove?</span>
        <Button size="sm" variant="danger" @click="confirmDelete">Yes</Button>
        <Button size="sm" variant="ghost" @click="confirmingDelete = false">No</Button>
      </template>
    </div>
  </div>
</template>
