<script setup lang="ts">

import { ref } from 'vue'
import { Button } from '@tasknote/ui'
import FileRefChip from '@/features/files/FileRefChip.vue'
import AddFileRefForm from '@/features/files/AddFileRefForm.vue'
import { useFileRefsStore } from '@/stores/fileRefs'
import type { FileRef } from '@tasknote/shared'

const props = defineProps<{
  taskId: number
  fileRefs: FileRef[]
}>()

const fileRefsStore = useFileRefsStore()
const showAddFile = ref(false)

function onFileDeleted(id: number): void {
  fileRefsStore.remove(id)
}

function onFileCreated(): void {
  showAddFile.value = false
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ul v-if="fileRefs.length" class="flex flex-col gap-2 list-none m-0 p-0">
      <li v-for="ref in fileRefs" :key="ref.id">
        <FileRefChip :file-ref="ref" @deleted="onFileDeleted" />
      </li>
    </ul>
    <p v-else-if="!showAddFile" class="text-sm text-text-muted">
      No file references attached.
    </p>

    <template v-if="showAddFile">
      <AddFileRefForm
        :task-id="taskId"
        @created="onFileCreated"
        @cancel="showAddFile = false"
      />
    </template>
    <template v-else>
      <Button variant="secondary" size="sm" @click="showAddFile = true">
        + Add file reference
      </Button>
    </template>
  </div>
</template>
