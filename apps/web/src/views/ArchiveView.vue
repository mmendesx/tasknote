<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Select } from '@tasknote/ui'
import type { SelectOption } from '@tasknote/ui'
import { useBoardsStore } from '@/stores/boards'
import ArchivedTaskList from '@/features/archive/ArchivedTaskList.vue'
import ArchivedNoteList from '@/features/archive/ArchivedNoteList.vue'

type Tab = 'tasks' | 'notes'

const boardsStore = useBoardsStore()

const activeTab = ref<Tab>('tasks')
const selectedBoardId = ref<number | null>(null)
const boardsReady = ref(false)

const hasMultipleBoards = computed(() => boardsStore.list.length > 1)

onMounted(async () => {
  if (boardsStore.list.length === 0) {
    await boardsStore.load()
  }
  if (boardsStore.list.length > 0 && selectedBoardId.value === null) {
    selectedBoardId.value = boardsStore.defaultBoardId
  }
  boardsReady.value = true
})

function selectTab(tab: Tab) {
  activeTab.value = tab
}

const boardOptions = computed<SelectOption[]>(() => [
  { value: 0, label: 'All boards' },
  ...boardsStore.list.map((b) => ({ value: b.id, label: b.name })),
])

const boardSelectValue = computed<number>(() => selectedBoardId.value ?? 0)

function onBoardSelect(value: string | number): void {
  const id = Number(value)
  selectedBoardId.value = id === 0 ? null : id
}
</script>

<template>
  <div class="flex h-full flex-col">
    
    <header class="border-b border-border bg-surface-elevated px-6 py-4">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-text-primary">Archive</h1>

        <div
          v-if="hasMultipleBoards && activeTab === 'tasks'"
          class="min-w-[12rem]"
        >
          <Select
            id="archive-board-select"
            label="Board"
            :model-value="boardSelectValue"
            :options="boardOptions"
            @update:model-value="onBoardSelect"
          />
        </div>
      </div>

      <div class="mt-4 flex gap-1" role="tablist" aria-label="Archive sections">
        <button
          role="tab"
          :aria-selected="activeTab === 'tasks'"
          :class="[
            'rounded-control px-4 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'tasks'
              ? 'bg-accent text-bg'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface',
          ]"
          @click="selectTab('tasks')"
        >
          Tasks
        </button>
        <button
          role="tab"
          :aria-selected="activeTab === 'notes'"
          :class="[
            'rounded-control px-4 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'notes'
              ? 'bg-accent text-bg'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface',
          ]"
          @click="selectTab('notes')"
        >
          Notes
        </button>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-6 py-6">
      <template v-if="boardsReady">
        <div
          v-show="activeTab === 'tasks'"
          role="tabpanel"
          aria-label="Archived tasks"
        >
          <ArchivedTaskList
            :board-id="hasMultipleBoards ? selectedBoardId : boardsStore.defaultBoardId"
          />
        </div>

        <div
          v-show="activeTab === 'notes'"
          role="tabpanel"
          aria-label="Archived notes"
        >
          <ArchivedNoteList />
        </div>
      </template>

      <div
        v-else
        class="flex items-center justify-center py-16"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden="true" />
      </div>
    </main>
  </div>
</template>
