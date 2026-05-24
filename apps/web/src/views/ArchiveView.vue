<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Page header -->
    <header class="border-b border-border bg-surface-elevated px-6 py-4">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-text-primary">Archive</h1>

        <!-- Board selector — only shown when multiple boards exist and Tasks tab is active -->
        <div
          v-if="hasMultipleBoards && activeTab === 'tasks'"
          class="flex items-center gap-2"
        >
          <label
            for="archive-board-select"
            class="text-xs font-medium text-text-secondary"
          >
            Board
          </label>
          <select
            id="archive-board-select"
            v-model="selectedBoardId"
            class="rounded-control border border-border bg-surface px-3 py-1.5
                   text-sm text-text-primary outline-none
                   focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
          >
            <option :value="null">All boards</option>
            <option
              v-for="board in boardsStore.list"
              :key="board.id"
              :value="board.id"
            >
              {{ board.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Tabs -->
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

    <!-- Tab panels — gated on boardsReady to prevent premature API calls -->
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

      <!-- Loading boards -->
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
