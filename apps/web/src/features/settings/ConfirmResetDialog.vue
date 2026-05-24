<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog, Button, Input } from '@tasknote/ui'
import * as adminApi from '@/api/admin'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const confirmText = ref('')
const isResetting = ref(false)
const resetError = ref<string | null>(null)

const canConfirm = computed(() => confirmText.value === 'RESET')

function handleClose() {
  confirmText.value = ''
  resetError.value = null
  emit('update:open', false)
}

async function handleConfirm() {
  if (!canConfirm.value) return

  isResetting.value = true
  resetError.value = null

  try {
    await adminApi.reset()
    // Full reload — forces onboarding check since settings.onboarded_at is now NULL
    window.location.reload()
  } catch (err) {
    resetError.value = err instanceof Error ? err.message : 'Reset failed. Please try again.'
    isResetting.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    title="Reset database"
    :closable="!isResetting"
    :dismissable="!isResetting"
    @update:open="handleClose"
  >
    <div class="space-y-4">
      <p class="text-sm text-text-secondary leading-relaxed">
        All boards, tasks, and notes will be permanently deleted. This cannot be undone.
        The app will reload and show the onboarding flow.
      </p>

      <div class="rounded-control border border-status-blocked/30 bg-status-blocked/10 px-3 py-2">
        <p class="text-xs font-medium text-status-blocked">
          This action is irreversible. Your data cannot be recovered.
        </p>
      </div>

      <Input
        v-model="confirmText"
        label='Type "RESET" to confirm'
        placeholder="RESET"
        :disabled="isResetting"
        :error="resetError ?? undefined"
      />
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="isResetting" @click="handleClose">
        Cancel
      </Button>
      <Button
        variant="danger"
        :disabled="!canConfirm"
        :loading="isResetting"
        @click="handleConfirm"
      >
        Reset everything
      </Button>
    </template>
  </Dialog>
</template>
