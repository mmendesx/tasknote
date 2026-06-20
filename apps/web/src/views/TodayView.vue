<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTodayStore, localDateString } from '@/stores/today'
import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'
import TaskDrawer from '@/features/board/TaskDrawer.vue'
import TodayRow from '@/features/today/TodayRow.vue'
import { Button } from '@tasknote/ui'
import { IconUndo, IconSun, IconRetry } from '@/features/today/icons'
import type { BoardWithColumns, ColumnWithTasks } from '@tasknote/shared'
import type { TodayTask } from '@/api/tasks'

const todayStore = useTodayStore()
const boardsStore = useBoardsStore()

const today = localDateString()

// Human-readable header date, e.g. "Friday, June 19". Built from the local date
// parts so it matches `today` exactly (no timezone drift from ISO parsing).
const headerDate = computed(() => {
  const [y, m, d] = today.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(y, m - 1, d))
})

const carriedCount = computed(
  () => todayStore.list.filter((t) => t.carried_days > 0).length,
)

// Count summary — doubles as the page's polite live region.
const countSummary = computed(() => {
  const n = todayStore.list.length
  if (n === 0) return 'Nothing committed yet'
  const base = `${n} task${n === 1 ? '' : 's'}`
  return carriedCount.value > 0 ? `${base} · ${carriedCount.value} carried over` : base
})

// Presentational grouping — preserves API order (server sorts committed_on ASC,
// so carried tasks precede fresh ones). Never re-sorts; splitting on
// carried_days is safe given that server guarantee.
const carriedTasks = computed(() => todayStore.list.filter((t) => t.carried_days > 0))
const freshTasks = computed(() => todayStore.list.filter((t) => t.carried_days === 0))
const showGroups = computed(
  () => carriedTasks.value.length > 0 && freshTasks.value.length > 0,
)

// ── Task drawer ───────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerTaskId = ref<number | null>(null)

function openTask(id: number): void {
  drawerTaskId.value = id
  drawerOpen.value = true
}
function closeDrawer(): void {
  drawerOpen.value = false
  drawerTaskId.value = null
}

// ── Default board / quick-add target ──────────────────────────────────────────
const defaultBoard = ref<BoardWithColumns | null>(null)
const defaultColumnId = computed<number | null>(() => {
  const cols = defaultBoard.value?.columns ?? []
  if (cols.length === 0) return null
  return [...cols].sort((a, b) => a.position - b.position)[0]?.id ?? null
})

onMounted(async () => {
  await todayStore.loadToday(today)
  if (boardsStore.list.length === 0) {
    await boardsStore.load()
  }
  const boardId = boardsStore.defaultBoardId
  if (boardId) {
    try {
      defaultBoard.value = await api.boards.getBoard(boardId)
    } catch {
      // no default board — quick-add will be disabled
    }
  }
  // Warm the column cache so each row's "move to column" menu is ready. Each
  // Today task may live on a different board, so we need every board's columns.
  boardsStore.ensureColumns().catch(() => {
    // status menu will simply be empty if columns can't load
  })
})

// Columns belonging to the task's OWN board (never the default board's) — moving
// a task into another board's column would relocate it (server doesn't guard).
function columnsForTask(task: TodayTask): ColumnWithTasks[] {
  return boardsStore.columnsForColumnId(task.column_id)
}

async function handleMove(taskId: number, columnId: number, title: string): Promise<void> {
  try {
    await api.tasks.moveTask({ task_id: taskId, column_id: columnId, position: 0 })
    // A move into a board's done column completes the task server-side, so it
    // may drop off Today — reload to reflect the new status either way.
    await todayStore.loadToday(today)
    announcement.value = `'${title}' moved`
  } catch (err) {
    todayStore.error = err instanceof Error ? err.message : 'Failed to move task'
  }
}

// ── Quick-add (single, deduplicated) ──────────────────────────────────────────
const quickAddTitle = ref('')
const isQuickAdding = ref(false)
const quickAddError = ref<string | null>(null)

const canQuickAdd = computed(
  () =>
    !isQuickAdding.value &&
    Boolean(quickAddTitle.value.trim()) &&
    Boolean(defaultColumnId.value),
)

async function submitQuickAdd(): Promise<void> {
  const trimmed = quickAddTitle.value.trim()
  if (!trimmed) {
    quickAddError.value = 'Title is required'
    return
  }
  if (!defaultColumnId.value) {
    quickAddError.value = "Create a board first to add today's tasks."
    return
  }

  isQuickAdding.value = true
  quickAddError.value = null
  try {
    await api.tasks.createTask({
      title: trimmed,
      column_id: defaultColumnId.value,
      committed_on: today,
      priority: 'medium',
    })
    quickAddTitle.value = ''
    await todayStore.loadToday(today)
  } catch (err) {
    quickAddError.value = err instanceof Error ? err.message : 'Failed to add task'
  } finally {
    isQuickAdding.value = false
  }
}

function handleQuickAddKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    submitQuickAdd()
  } else if (e.key === 'Escape') {
    quickAddTitle.value = ''
    quickAddError.value = null
  }
}

// ── Row actions + announcements ───────────────────────────────────────────────
const completingIds = ref<Set<number>>(new Set())
const announcement = ref('')
// Last completed task, kept so the Undo affordance can restore it.
const undoTarget = ref<{ id: number; title: string } | null>(null)

async function handleToggleDone(id: number, title: string): Promise<void> {
  completingIds.value = new Set(completingIds.value).add(id)
  try {
    await todayStore.toggleDone(id)
    undoTarget.value = { id, title }
    announcement.value = `'${title}' marked done`
  } catch {
    // error surfaced via store.error
  } finally {
    const next = new Set(completingIds.value)
    next.delete(id)
    completingIds.value = next
  }
}

const isUndoing = ref(false)
async function handleUndo(): Promise<void> {
  const target = undoTarget.value
  if (!target || isUndoing.value) return
  isUndoing.value = true
  try {
    await todayStore.restore(target.id, today)
    announcement.value = `'${target.title}' restored to today`
    undoTarget.value = null
  } catch {
    // error surfaced via store.error
  } finally {
    isUndoing.value = false
  }
}

function retryLoad(): void {
  todayStore.loadToday(today)
}
</script>

<template>
  <div class="today-view">
    <!-- Header -->
    <header class="today-view__header">
      <h1 class="today-view__title">Today</h1>
      <p class="today-view__date">{{ headerDate }}</p>
      <p class="today-view__count" aria-live="polite">{{ countSummary }}</p>
    </header>

    <!-- Quick-add: single control, reused across empty + populated states -->
    <div class="today-view__add-row">
      <label for="today-quick-add" class="sr-only">Add a task for today</label>
      <input
        id="today-quick-add"
        v-model="quickAddTitle"
        type="text"
        class="today-view__quick-input"
        placeholder="Add a task for today…"
        :disabled="isQuickAdding || !defaultColumnId"
        :aria-invalid="quickAddError !== null || undefined"
        :aria-describedby="
          quickAddError
            ? 'today-quick-add-error'
            : !defaultColumnId
              ? 'today-quick-add-hint'
              : undefined
        "
        @keydown="handleQuickAddKeydown"
      />
      <Button
        variant="primary"
        size="sm"
        class="today-view__quick-btn"
        :disabled="!canQuickAdd"
        :loading="isQuickAdding"
        @click="submitQuickAdd"
      >
        Add
      </Button>
      <p
        v-if="quickAddError"
        id="today-quick-add-error"
        role="alert"
        class="today-view__quick-error"
      >
        {{ quickAddError }}
      </p>
      <p
        v-else-if="!defaultColumnId"
        id="today-quick-add-hint"
        class="today-view__hint"
      >
        Create a board first to add today's tasks.
      </p>
    </div>

    <!-- Live region for completion/removal/undo announcements -->
    <span class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</span>

    <!-- Undo affordance after a completion -->
    <div v-if="undoTarget" class="today-view__undo" role="status">
      <span class="today-view__undo-text">Marked '{{ undoTarget.title }}' done.</span>
      <button
        type="button"
        class="today-view__undo-btn"
        :disabled="isUndoing"
        @click="handleUndo"
      >
        <IconUndo width="14" height="14" aria-hidden="true" />
        {{ isUndoing ? 'Undoing…' : 'Undo' }}
      </button>
    </div>

    <!-- Loading: skeleton rows -->
    <template v-if="todayStore.loading">
      <span class="sr-only" aria-live="polite" aria-atomic="true">Loading today's tasks…</span>
      <ul class="today-list" aria-hidden="true">
        <li
          v-for="n in 3"
          :key="n"
          class="today-skeleton"
        >
          <span
            class="skeleton-line skeleton-line--title"
            :class="{ 'skeleton-line--short': n === 2 }"
          ></span>
          <span class="skeleton-line skeleton-line--meta"></span>
        </li>
      </ul>
    </template>

    <!-- Error: inline panel + retry -->
    <div v-else-if="todayStore.error" class="today-view__error" role="alert">
      <p class="today-view__error-text">{{ todayStore.error }}</p>
      <Button variant="secondary" size="sm" @click="retryLoad">
        <IconRetry width="14" height="14" aria-hidden="true" />
        Retry
      </Button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="todayStore.list.length === 0"
      class="today-view__empty"
      role="status"
    >
      <IconSun class="today-view__empty-icon" width="44" height="44" aria-hidden="true" />
      <p class="today-view__empty-message">
        Nothing committed for today — add something from standup.
      </p>
    </div>

    <!-- Populated -->
    <template v-else>
      <!-- Grouped: carried-over then today (presentational only, no re-sort) -->
      <template v-if="showGroups">
        <section class="today-group" aria-labelledby="today-group-carried">
          <h2 id="today-group-carried" class="today-group__heading">Carried over</h2>
          <ul class="today-list" role="list" aria-label="Carried-over tasks">
            <TodayRow
              v-for="task in carriedTasks"
              :key="task.id"
              :task="task"
              :completing="completingIds.has(task.id)"
              :columns="columnsForTask(task)"
              @open="openTask"
              @done="handleToggleDone"
              @remove="handleToggleDone"
              @move="handleMove"
            />
          </ul>
        </section>
        <section class="today-group" aria-labelledby="today-group-fresh">
          <h2 id="today-group-fresh" class="today-group__heading">Today</h2>
          <ul class="today-list" role="list" aria-label="Today's tasks">
            <TodayRow
              v-for="task in freshTasks"
              :key="task.id"
              :task="task"
              :completing="completingIds.has(task.id)"
              :columns="columnsForTask(task)"
              @open="openTask"
              @done="handleToggleDone"
              @remove="handleToggleDone"
              @move="handleMove"
            />
          </ul>
        </section>
      </template>

      <!-- Flat -->
      <ul v-else class="today-list" role="list" aria-label="Today's tasks">
        <TodayRow
          v-for="task in todayStore.list"
          :key="task.id"
          :task="task"
          :completing="completingIds.has(task.id)"
          :columns="columnsForTask(task)"
          @open="openTask"
          @done="handleToggleDone"
          @remove="handleToggleDone"
          @move="handleMove"
        />
      </ul>
    </template>

    <TaskDrawer
      :open="drawerOpen"
      :task-id="drawerTaskId"
      @update:open="(v) => { if (!v) closeDrawer() }"
    />
  </div>
</template>

<style scoped>
.today-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.today-view__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.today-view__title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: var(--leading-heading);
  margin: 0;
}

.today-view__date {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: 0;
}

.today-view__count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 2px 0 0;
  font-variant-numeric: tabular-nums;
}

/* ── Quick-add ───────────────────────────────────────────────────────────────── */
.today-view__add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.today-view__quick-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  transition: border-color var(--motion-duration-fast) var(--motion-easing);
}

.today-view__quick-input:focus-visible {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.today-view__quick-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.today-view__quick-btn {
  flex-shrink: 0;
}

.today-view__quick-error {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--color-status-blocked);
  margin: 0;
}

.today-view__hint {
  width: 100%;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

/* ── Undo affordance ─────────────────────────────────────────────────────────── */
.today-view__undo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-control);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.today-view__undo-text {
  flex: 1;
  min-width: 0;
}

.today-view__undo-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  cursor: pointer;
  transition:
    color var(--motion-duration-fast),
    background-color var(--motion-duration-fast);
}

.today-view__undo-btn:hover {
  color: var(--color-bg);
  background: var(--color-accent);
}

.today-view__undo-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* ── Error panel ─────────────────────────────────────────────────────────────── */
.today-view__error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-status-blocked) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-status-blocked) 30%, transparent);
}

.today-view__error-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--color-status-blocked);
  margin: 0;
}

/* ── Empty ───────────────────────────────────────────────────────────────────── */
.today-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 20px;
  text-align: center;
}

.today-view__empty-icon {
  color: var(--color-text-muted);
  opacity: 0.4;
}

.today-view__empty-message {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  margin: 0;
  max-width: 360px;
}

/* ── Groups ──────────────────────────────────────────────────────────────────── */
.today-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.today-group + .today-group {
  margin-top: 8px;
}

.today-group__heading {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  margin: 0;
  padding: 0 8px;
}

/* ── List ────────────────────────────────────────────────────────────────────── */
.today-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ── Skeleton ────────────────────────────────────────────────────────────────── */
@keyframes today-shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.today-skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-border);
}

.skeleton-line {
  display: block;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    var(--color-border) 25%,
    var(--color-surface-elevated) 50%,
    var(--color-border) 75%
  );
  background-size: 200% 100%;
  animation: today-shimmer 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  height: 0.75rem;
  width: 60%;
}

.skeleton-line--title.skeleton-line--short {
  width: 40%;
}

.skeleton-line--meta {
  height: 0.625rem;
  width: 35%;
}

/* ── Utilities ───────────────────────────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
  .today-row,
  .today-view__quick-input,
  .today-view__undo-btn {
    transition: none;
  }
}
</style>
