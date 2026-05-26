<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, Button, Input } from '@tasknote/ui'

const props = defineProps<{
  open: boolean
  itemName: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

const typed = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) typed.value = ''
  }
)

function handleConfirm() {
  if (typed.value !== 'DELETE') return
  emit('confirm')
  emit('update:open', false)
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    title="Delete permanently"
    description="This action cannot be undone. The item will be removed from the database entirely."
    :dismissable="true"
    @update:open="emit('update:open', $event)"
  >
    <div class="mt-2 space-y-4">
      <p class="text-sm text-text-secondary">
        You are about to permanently delete
        <span class="font-medium text-text-primary">"{{ itemName }}"</span>.
      </p>

      <Input
        v-model="typed"
        label='Type "DELETE" to confirm'
        placeholder="DELETE"
        @keydown.enter="handleConfirm"
      />
    </div>

    <template #footer>
      <Button variant="ghost" @click="handleCancel">Cancel</Button>
      <Button
        variant="danger"
        :disabled="typed !== 'DELETE'"
        @click="handleConfirm"
      >
        Delete permanently
      </Button>
    </template>
  </Dialog>
</template>
