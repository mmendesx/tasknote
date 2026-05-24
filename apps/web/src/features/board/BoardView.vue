<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSortable } from '@vueuse/integrations/useSortable'
import type { ColumnWithTasks } from '@tasknote/shared'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import { useBoardsStore } from '@/stores/boards'
import { useTagsStore } from '@/stores/tags'
import { useIsDesktop } from '@/composables/useIsDesktop'
import { Button } from '@tasknote/ui'
import KanbanColumn from './KanbanColumn.vue'
import TaskDrawer from './TaskDrawer.vue'
import BoardTagFilter from '@/features/tags/BoardTagFilter.vue'

const route = useRoute()
const router = useRouter()
const currentBoardStore = useCurrentBoardStore()
const boardsStore = useBoardsStore()
const tagsStore = useTagsStore()
const isDesktop = useIsDesktop()

// Tag colors map for TaskCard dots
const tagColors = computed<Record<number, string>>(() =>
  Object.fromEntries(tagsStore.list.map((t) => [t.id, t.color]))
)

// Resolve board id: route param → default board
const boardId = computed<number | null>(() => {
  const param = route.params.id
  if (param) {
    const n = Number(Array.isArray(param) ? param[0] : param)
    return isNaN(n) ? null : n
  }
  return boardsStore.defaultBoardId
})

async function loadBoard(id: number | null) {
  if (!id) return
  await currentBoardStore.load(id)
}

// Load on mount and route change
onMounted(async () => {
  if (boardsStore.list.length === 0) {
    await boardsStore.load()
  }
  if (tagsStore.list.length === 0) {
    tagsStore.load()
  }
  await loadBoard(boardId.value)
})

watch(boardId, (id) => {
  loadBoard(id)
})

// ─── Column sortable ──────────────────────────────────────────────────────────

// Local column mirror — DnD mutates localColumns; watch syncs from store
const localColumns = ref<ColumnWithTasks[]>([])

watch(
  () => currentBoardStore.board?.columns,
  (cols) => { localColumns.value = cols ? [...cols] : [] },
  { immediate: true, deep: false }
)

// visibleColumns with tag filter applied
const visibleColumns = computed(() => {
  const filter = currentBoardStore.tagFilter
  if (filter.length === 0) return localColumns.value
  return localColumns.value.map((col) => ({
    ...col,
    tasks: col.tasks.filter((t) =>
      filter.every((tagId) => t.tag_ids?.includes(tagId))
    ),
  }))
})

const columnsContainerRef = ref<HTMLElement | null>(null)

const { option: colSortableOption } = useSortable(columnsContainerRef, localColumns, {
  animation: 150,
  ghostClass: 'col-ghost',
  filter: '.kanban-column__tasks',
  preventOnFilter: false,
  onEnd: () => {
    currentBoardStore.reorderColumns(localColumns.value.map((c) => c.id))
  },
})

// Must run after mount — colSortableOption() is a no-op before tryOnMounted fires.
onMounted(() => {
  colSortableOption('disabled', !isDesktop.value)
  watch(isDesktop, (desktop) => {
    colSortableOption('disabled', !desktop)
  })
})

// ─── Task move handler (from child) ──────────────────────────────────────────

function handleMoveTask(taskId: number, toColumnId: number, toPosition: number) {
  currentBoardStore.moveTask(taskId, toColumnId, toPosition)
}

// ─── Task drawer ──────────────────────────────────────────────────────────────

const drawerOpen     = ref(false)
const selectedTaskId = ref<number | null>(null)

function handleOpenTask(taskId: number): void {
  selectedTaskId.value = taskId
  drawerOpen.value = true
}

function handleDrawerClose(): void {
  drawerOpen.value = false
  selectedTaskId.value = null
}

// ─── Add task (board toolbar) ─────────────────────────────────────────────────

const isAddingTask = ref(false)

async function addTask(): Promise<void> {
  if (isAddingTask.value || !currentBoardStore.board) return
  const firstCol = currentBoardStore.board.columns[0]
  if (!firstCol) return
  isAddingTask.value = true
  try {
    const task = await currentBoardStore.createTask(firstCol.id, {
      title: 'New task',
      priority: 'low',
      column_id: firstCol.id,
    })
    if (task) {
      // Open drawer immediately so user fills in details
      selectedTaskId.value = task.id
      drawerOpen.value = true
    }
  } finally {
    isAddingTask.value = false
  }
}

// ─── Create first board ───────────────────────────────────────────────────────

const isCreatingBoard = ref(false)

async function createFirstBoard() {
  if (isCreatingBoard.value) return
  isCreatingBoard.value = true
  try {
    const board = await boardsStore.create({ name: 'My Board', position: 0 })
    router.push(`/b/${board.id}`)
  } finally {
    isCreatingBoard.value = false
  }
}
</script>

<template>
  <div class="board-view">
    <!-- Mobile DnD banner -->
    <aside
      v-if="!isDesktop"
      class="board-view__mobile-banner"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      Drag-and-drop available on desktop
    </aside>

    <!-- Tag filter bar -->
    <BoardTagFilter :board-id="boardId" />

    <!-- Board toolbar -->
    <div v-if="currentBoardStore.board" class="board-view__toolbar">
      <Button
        variant="primary"
        size="sm"
        :disabled="isAddingTask"
        @click="addTask"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Add task
      </Button>
    </div>

    <!-- Loading state -->
    <div v-if="currentBoardStore.loading" class="board-view__state" aria-live="polite">
      <span class="state-spinner" aria-hidden="true" />
      <p>Loading board…</p>
    </div>

    <!-- Error state -->
    <div v-else-if="currentBoardStore.error" class="board-view__state board-view__state--error" role="alert">
      <p>Failed to load board: {{ currentBoardStore.error }}</p>
    </div>

    <!-- Empty / no board state -->
    <div
      v-else-if="!currentBoardStore.board"
      class="board-view__state"
      aria-live="polite"
    >
      <svg viewBox="0 0 48 48" fill="none" width="48" height="48" aria-hidden="true" style="color: var(--color-border)">
        <rect x="2" y="2" width="18" height="44" rx="3" stroke="currentColor" stroke-width="2.5" />
        <rect x="26" y="2" width="20" height="28" rx="3" stroke="currentColor" stroke-width="2.5" />
      </svg>
      <p style="font-weight: 600; color: var(--color-text-primary)">No board yet</p>
      <p style="font-size: var(--text-xs)">Create your first board to get started</p>
      <button
        class="board-create-btn focus-ring"
        :disabled="isCreatingBoard"
        @click="createFirstBoard"
      >
        {{ isCreatingBoard ? 'Creating…' : '+ New board' }}
      </button>
    </div>

    <!-- Board canvas -->
    <div
      v-else
      ref="columnsContainerRef"
      class="board-view__canvas"
      role="list"
      :aria-label="`${currentBoardStore.board.name} board`"
    >
      <KanbanColumn
        v-for="col in visibleColumns"
        :key="col.id"
        :column="col"
        :tag-colors="tagColors"
        role="listitem"
        @open-task="handleOpenTask"
        @move-task="handleMoveTask"
      />
    </div>

    <!-- Task drawer (ICT-19) -->
    <TaskDrawer
      v-model:open="drawerOpen"
      :task-id="selectedTaskId"
      @update:open="(v) => { if (!v) handleDrawerClose() }"
    />
  </div>
</template>

<style scoped>
.board-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.board-view__mobile-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: color-mix(in srgb, var(--color-status-doing) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-status-doing) 30%, transparent);
  color: var(--color-status-doing);
  font-size: var(--text-xs);
  font-weight: 500;
  flex-shrink: 0;
}


.board-view__canvas {
  display: flex;
  flex-direction: row;
  gap: 12px;
  padding: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  align-items: flex-start;
}

.board-view__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.board-view__state--error { color: var(--color-status-blocked); }

.state-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .state-spinner { animation: none; }
}

.board-create-btn {
  margin-top: 4px;
  padding: 8px 20px;
  border-radius: var(--radius-control);
  background-color: var(--color-accent);
  color: var(--color-bg);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--motion-duration-fast);
}

.board-create-btn:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
}

.board-create-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.board-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
  gap: 8px;
}

:global(.col-ghost) {
  opacity: 0.35;
  border: 2px dashed var(--color-accent);
  border-radius: var(--radius-card);
  background-color: color-mix(in srgb, var(--color-accent) 6%, transparent);
}

</style>
