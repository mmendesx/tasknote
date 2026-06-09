<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Button, Input, Dialog } from '@tasknote/ui'
import { useSettingsStore, useBoardsStore } from '@/stores'
import * as adminApi from '@/api/admin'
import ThemeToggle from '@/features/settings/ThemeToggle.vue'
import AccentPicker from '@/features/settings/AccentPicker.vue'
import ConfirmResetDialog from '@/features/settings/ConfirmResetDialog.vue'
import TagManager from '@/features/tags/TagManager.vue'

const settingsStore = useSettingsStore()
const boardsStore = useBoardsStore()

const displayName = ref(settingsStore.settings?.display_name ?? '')

watch(
  () => settingsStore.settings?.display_name,
  (name) => {
    if (name != null) displayName.value = name
  },
)

onMounted(() => {
  boardsStore.load()
})

async function saveDisplayName() {
  const trimmed = displayName.value.trim()
  if (!trimmed || trimmed === settingsStore.settings?.display_name) return
  await settingsStore.update({ display_name: trimmed })
}

const currentDefaultBoardId = computed(() => settingsStore.settings?.default_board_id ?? null)

async function handleBoardSelect(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  const id = val ? Number(val) : null
  await settingsStore.update({ default_board_id: id })
}

const isExporting = ref(false)
const exportError = ref<string | null>(null)

async function handleExport() {
  isExporting.value = true
  exportError.value = null
  try {
    const data = await adminApi.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tasknote-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export failed'
  } finally {
    isExporting.value = false
  }
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const importConfirmOpen = ref(false)
const importPayload = ref<unknown>(null)
const importParseError = ref<string | null>(null)
const isImporting = ref(false)
const importError = ref<string | null>(null)

function triggerFilePicker() {
  importParseError.value = null
  importError.value = null
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    importPayload.value = JSON.parse(text)
    importConfirmOpen.value = true
  } catch {
    importParseError.value = 'The selected file is not valid JSON.'
  }

  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function confirmImport() {
  if (!importPayload.value) return
  isImporting.value = true
  importError.value = null
  try {
    await adminApi.importData(importPayload.value)
    importConfirmOpen.value = false
    window.location.reload()
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Import failed'
    isImporting.value = false
  }
}

function cancelImport() {
  importConfirmOpen.value = false
  importPayload.value = null
  importError.value = null
}

const resetDialogOpen = ref(false)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-10 space-y-10">
    <h1 class="text-xl font-semibold text-text-primary">Settings</h1>

    <section aria-labelledby="profile-heading">
      <h2 id="profile-heading" class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Profile
      </h2>
      <div class="rounded-panel border border-border bg-surface p-5 space-y-4">
        <Input
          v-model="displayName"
          label="Display name"
          placeholder="Your name"
          :disabled="settingsStore.loading"
          @blur="saveDisplayName"
        />
        <p class="text-xs text-text-muted">Saved automatically when you click away.</p>
      </div>
    </section>

    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Appearance
      </h2>
      <div class="rounded-panel border border-border bg-surface p-5 space-y-5">
        <div>
          <p class="mb-2 text-xs font-medium text-text-secondary">Theme</p>
          <ThemeToggle />
        </div>

        <div>
          <p class="mb-2 text-xs font-medium text-text-secondary">Accent color</p>
          <AccentPicker />
        </div>

        <div>
          <TagManager />
        </div>
      </div>
    </section>

    <section aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Preferences
      </h2>
      <div class="rounded-panel border border-border bg-surface p-5">
        <label for="default-board" class="block mb-1 text-xs font-medium text-text-secondary">
          Default board
        </label>
        <select
          id="default-board"
          class="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
          :value="currentDefaultBoardId ?? ''"
          @change="handleBoardSelect"
        >
          <option value="">— None —</option>
          <option
            v-for="board in boardsStore.list"
            :key="board.id"
            :value="board.id"
          >
            {{ board.name }}
          </option>
        </select>
        <p class="mt-1.5 text-xs text-text-muted">
          Opens automatically when you launch the app.
        </p>
      </div>
    </section>

    <section aria-labelledby="danger-heading">
      <h2 id="danger-heading" class="mb-4 text-sm font-semibold uppercase tracking-wider text-status-blocked">
        Danger zone
      </h2>
      <div class="rounded-panel border border-status-blocked/30 bg-surface p-5 space-y-4">

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-text-primary">Export data</p>
            <p class="text-xs text-text-muted">Download all your boards, tasks, notes, and tags as JSON.</p>
            <p v-if="exportError" role="alert" class="mt-1 text-xs text-status-blocked">{{ exportError }}</p>
          </div>
          <Button variant="secondary" size="sm" :loading="isExporting" @click="handleExport">
            Export
          </Button>
        </div>

        <hr class="border-border" />

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-text-primary">Import data</p>
            <p class="text-xs text-text-muted">Restore from a previously exported JSON file. Overwrites current data.</p>
            <p v-if="importParseError" role="alert" class="mt-1 text-xs text-status-blocked">{{ importParseError }}</p>
          </div>
          <Button variant="secondary" size="sm" @click="triggerFilePicker">
            Import
          </Button>
          <input
            ref="fileInputRef"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            aria-hidden="true"
            @change="handleFileChange"
          />
        </div>

        <hr class="border-border" />

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-text-primary">Reset database</p>
            <p class="text-xs text-text-muted">Delete all data permanently and restart onboarding.</p>
          </div>
          <Button variant="danger" size="sm" @click="resetDialogOpen = true">
            Reset
          </Button>
        </div>
      </div>
    </section>
  </div>

  <Dialog
    :open="importConfirmOpen"
    title="Import data"
    description="This will overwrite all existing boards, tasks, notes, and settings with the imported file. This cannot be undone."
    :dismissable="!isImporting"
    :closable="!isImporting"
    @update:open="cancelImport"
  >
    <p v-if="importError" role="alert" class="text-sm text-status-blocked">{{ importError }}</p>

    <template #footer>
      <Button variant="ghost" :disabled="isImporting" @click="cancelImport">
        Cancel
      </Button>
      <Button variant="danger" :loading="isImporting" @click="confirmImport">
        Import and overwrite
      </Button>
    </template>
  </Dialog>

  <ConfirmResetDialog v-model:open="resetDialogOpen" />
</template>
