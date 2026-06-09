<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTodayStore, localDateString } from '@/stores/today'
import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'
import TaskDrawer from '@/features/board/TaskDrawer.vue'
import type { BoardWithColumns } from '@tasknote/shared'

const todayStore = useTodayStore()
const boardsStore = useBoardsStore()

const today = localDateString()

const drawerOpen = ref(false)
const drawerTaskId = ref<number | null>(null)

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
})

function openTask(id: number): void {
  drawerTaskId.value = id
  drawerOpen.value = true
}

function closeDrawer(): void {
  drawerOpen.value = false
  drawerTaskId.value = null
}

const quickAddTitle = ref('')
const isQuickAdding = ref(false)
const quickAddError = ref<string | null>(null)
const completingIds = ref<Set<number>>(new Set())

async function submitQuickAdd(): Promise<void> {
  const trimmed = quickAddTitle.value.trim()
  if (!trimmed) {
    quickAddError.value = 'Title is required'
    return
  }
  if (!defaultColumnId.value) {
    quickAddError.value = 'Create a board first to add today\'s tasks.'
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

async function handleUncommit(id: number): Promise<void> {
  try {
    await todayStore.uncommit(id)
  } catch {
    // error state surfaced via store.error
  }
}

async function handleToggleDone(id: number): Promise<void> {
  completingIds.value = new Set(completingIds.value).add(id)
  try {
    // toggleDone marks the task complete and removes it from the today list
    await todayStore.toggleDone(id)
  } catch {
    // error state surfaced via store.error
  } finally {
    const next = new Set(completingIds.value)
    next.delete(id)
    completingIds.value = next
  }
}
</script>

<template>
  <div class="today-view">
    <div class="today-view__header">
      <p class="today-view__date">{{ today }}</p>
    </div>

    <div v-if="todayStore.loading" class="today-view__state" aria-live="polite">
      Loading…
    </div>

    <template v-else-if="todayStore.list.length === 0">
      <div class="today-view__empty" role="status">
        <svg
          class="today-view__empty-icon"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
          width="48"
          height="48"
        >
          <circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M24 4v4M24 40v4M4 24h4M40 24h4M9.17 9.17l2.83 2.83M36 36l2.83 2.83M9.17 38.83l2.83-2.83M36 12l2.83-2.83"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
        <p class="today-view__empty-message">
          Nothing committed for today &mdash; add something from standup.
        </p>
        <div class="today-view__quick-add">
          <label for="today-quick-add" class="sr-only">Add a task for today</label>
          <input
            id="today-quick-add"
            v-model="quickAddTitle"
            type="text"
            class="today-view__quick-input"
            placeholder="Add a task for today…"
            :disabled="isQuickAdding || !defaultColumnId"
            :aria-invalid="quickAddError !== null"
            :aria-describedby="quickAddError ? 'today-quick-add-error' : 'today-quick-add-hint'"
            @keydown="handleQuickAddKeydown"
          />
          <button
            type="button"
            class="today-view__quick-btn"
            :disabled="isQuickAdding || !quickAddTitle.trim() || !defaultColumnId"
            @click="submitQuickAdd"
          >
            {{ isQuickAdding ? 'Adding…' : 'Add' }}
          </button>
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
            class="today-view__empty-hint"
          >
            Create a board first to add today's tasks.
          </p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="today-view__add-row">
        <label for="today-bottom-add" class="sr-only">Add a task for today</label>
        <input
          id="today-bottom-add"
          v-model="quickAddTitle"
          type="text"
          class="today-view__quick-input"
          placeholder="Add a task for today…"
          :disabled="isQuickAdding || !defaultColumnId"
          :aria-invalid="quickAddError !== null"
          :aria-describedby="quickAddError ? 'today-bottom-add-error' : (!defaultColumnId ? 'today-bottom-add-hint' : undefined)"
          @keydown="handleQuickAddKeydown"
        />
        <button
          type="button"
          class="today-view__quick-btn"
          :disabled="isQuickAdding || !quickAddTitle.trim() || !defaultColumnId"
          @click="submitQuickAdd"
        >
          {{ isQuickAdding ? 'Adding…' : 'Add' }}
        </button>
        <p
          v-if="quickAddError"
          id="today-bottom-add-error"
          role="alert"
          class="today-view__quick-error"
        >
          {{ quickAddError }}
        </p>
        <p
          v-else-if="!defaultColumnId"
          id="today-bottom-add-hint"
          class="today-view__empty-hint"
        >
          Create a board first to add today's tasks.
        </p>
      </div>

      <ul class="today-list" role="list" aria-label="Today's tasks">
        <li
          v-for="task in todayStore.list"
          :key="task.id"
          class="today-row"
        >
          <button
            type="button"
            class="today-row__body"
            :aria-label="`Open task: ${task.title}`"
            @click="openTask(task.id)"
          >
            <span class="today-row__title">{{ task.title }}</span>
            <span class="today-row__meta">
              <span
                v-if="task.carried_days > 0"
                class="today-row__carried"
                :aria-label="`Carried ${task.carried_days} day${task.carried_days === 1 ? '' : 's'}`"
              >
                carried {{ task.carried_days }}d
              </span>
              <span
                v-if="task.due_date"
                class="today-row__due"
              >
                {{ String(task.due_date).slice(0, 10) }}
              </span>
              <span
                class="today-row__priority"
                :data-priority="task.priority"
              >
                {{ task.priority }}
              </span>
            </span>
          </button>

          <button
            type="button"
            class="today-row__done"
            :aria-label="`Mark '${task.title}' as done`"
            :disabled="completingIds.has(task.id)"
            @click="handleToggleDone(task.id)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="M3 8.5l3.5 3.5L13 5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ completingIds.has(task.id) ? 'Done…' : 'Done' }}
          </button>

          <button
            type="button"
            class="today-row__uncommit-btn"
            :aria-label="`Remove '${task.title}' from today`"
            title="Remove from today"
            @click="handleUncommit(task.id)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="M3 8h10"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </li>
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

.today-view__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.today-view__date {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.today-view__state {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: 48px 0;
  text-align: center;
}

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

.today-view__empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.today-view__quick-add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 480px;
  flex-wrap: wrap;
}

.today-view__add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
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
  transition: border-color var(--motion-duration-fast);
}

.today-view__quick-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.today-view__quick-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.today-view__quick-btn {
  padding: 8px 14px;
  border-radius: var(--radius-control);
  background: var(--color-accent);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 500;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity var(--motion-duration-fast);
}

.today-view__quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.today-view__quick-error {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--color-status-blocked);
  margin: 0;
}

/* List */

.today-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.today-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  transition:
    border-color var(--motion-duration-fast) var(--motion-easing),
    background-color var(--motion-duration-fast) var(--motion-easing);
}

.today-row:hover {
  border-color: var(--color-text-muted);
  background: var(--color-surface-elevated);
}

.today-row__done {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-status-done, #4ade80);
  background: transparent;
  border: 1px solid var(--color-status-done, #4ade80);
  cursor: pointer;
  transition:
    color var(--motion-duration-fast),
    background-color var(--motion-duration-fast),
    border-color var(--motion-duration-fast),
    opacity var(--motion-duration-fast);
}

.today-row__done:hover {
  color: var(--color-bg);
  background: var(--color-status-done, #4ade80);
}

.today-row__done:disabled {
  opacity: 0.55;
  cursor: default;
}

.today-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  color: inherit;
  font: inherit;
}

.today-row__title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  word-break: break-word;
  line-height: var(--leading-body);
}

.today-row__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.today-row__carried {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-status-doing);
  background: color-mix(in srgb, var(--color-status-doing) 12%, transparent);
  border-radius: 999px;
  padding: 1px 7px;
}

.today-row__due {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.today-row__priority {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: capitalize;
}

.today-row__priority[data-priority='high'] {
  color: var(--color-status-blocked);
}

.today-row__priority[data-priority='urgent'] {
  color: var(--color-accent);
}

.today-row__uncommit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--motion-duration-fast),
    color var(--motion-duration-fast);
}

.today-row:hover .today-row__uncommit-btn,
.today-row:focus-within .today-row__uncommit-btn {
  opacity: 1;
  pointer-events: auto;
}

.today-row__uncommit-btn:hover {
  color: var(--color-text-primary);
}

@media (hover: none) {
  .today-row__uncommit-btn {
    opacity: 0.4;
    pointer-events: auto;
  }
}

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
</style>
