/**
 * NFR-3 — Drag-and-drop wiring tests (handler-level, not real drag)
 *
 * Real SortableJS drag is a full pointer-event / HTML5-drag sequence that
 * jsdom cannot simulate faithfully. These tests instead reach the handler
 * seam exposed by a capturing `useSortable` mock and verify that:
 *
 *   SCN-D1  column `onEnd` → `currentBoardStore.reorderColumns(newOrder)`
 *   SCN-D2  KanbanColumn task `onEnd` → emits `moveTask` with correct args
 *   SCN-D3  BoardView `@move-task` binding → `currentBoardStore.moveTask(...)`
 *   SCN-D4  KanbanColumn `onEnd` guard — missing dataset → no emit
 *
 * Manual-QA note: visual drag feedback (ghost classes, animations, mobile
 * disable) must be verified by hand in a real browser. jsdom does not support
 * the pointer/touch event model that SortableJS relies on.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { mount, shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Ref } from 'vue'
import type { ColumnWithTasks } from '@tasknote/shared'

// ─── Capturing useSortable mock ───────────────────────────────────────────────
// This is the core seam. Instead of discarding `options`, we record each call
// so tests can invoke `options.onEnd` directly — no production changes needed.

type SortableOptions = {
  onEnd?: (evt: Partial<SortableEvent>) => void
  filter?: string
  group?: string
  [key: string]: unknown
}

type SortableEvent = {
  item: HTMLElement
  to: HTMLElement
  from?: HTMLElement
  oldIndex?: number
  newIndex: number
}

type CapturedSortable = {
  list: Ref<unknown[]>
  options: SortableOptions
}

// Module-scope array — populated by the mock factory below.
// Must be declared here so tests can reference it after vi.mock hoisting.
const sortableCalls: CapturedSortable[] = []

vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: (_target: unknown, list: Ref<unknown[]>, options: SortableOptions) => {
    sortableCalls.push({ list, options })
    return { option: vi.fn() }
  },
}))

// ─── Shared module mocks ──────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/composables/useIsDesktop', () => ({
  useIsDesktop: () => ({ value: true }),
}))

vi.mock('@/composables/useAnime', () => ({
  useAnime: () => ({
    animate: vi.fn(),
    prefersReducedMotion: { value: true }, // skip animation side-effects
  }),
}))

vi.mock('@tasknote/ui', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
  Button: {
    name: 'Button',
    template: '<button><slot /></button>',
    props: ['variant', 'size'],
  },
  DropdownMenu: {
    name: 'DropdownMenu',
    template: '<div><slot name="trigger" /></div>',
    props: ['items', 'side', 'align'],
  },
}))

vi.mock('@/api', () => ({
  tasks: {
    moveTask: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  boards: {
    getBoard: vi.fn().mockResolvedValue(null),
    listBoards: vi.fn().mockResolvedValue([]),
  },
  columns: { reorderColumns: vi.fn().mockResolvedValue(undefined) },
  tags: {
    listTags: vi.fn().mockResolvedValue([]),
    addTagToTask: vi.fn(),
    removeTagFromTask: vi.fn(),
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useCurrentBoardStore } from '@/stores/currentBoard'
import * as api from '@/api'
import BoardView from '../BoardView.vue'
import KanbanColumn from '../KanbanColumn.vue'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTask(id: number, title: string, columnId: number) {
  return {
    id,
    column_id: columnId,
    title,
    description_md: null,
    priority: 'medium' as const,
    due_date: null,
    position: 0,
    archived_at: null,
    completed_at: null,
    tag_ids: [] as number[],
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function makeThreeColumnBoard() {
  return {
    id: 1,
    name: 'Test Board',
    position: 0,
    created_at: new Date(),
    updated_at: new Date(),
    columns: [
      {
        id: 10,
        board_id: 1,
        name: 'Backlog',
        color: '#ccc',
        wip_limit: null,
        is_done: false,
        position: 0,
        tasks: [makeTask(100, 'Task Alpha', 10)],
      },
      {
        id: 11,
        board_id: 1,
        name: 'Doing',
        color: '#ccc',
        wip_limit: null,
        is_done: false,
        position: 1,
        tasks: [makeTask(200, 'Task Beta', 11)],
      },
      {
        id: 12,
        board_id: 1,
        name: 'Done',
        color: '#ccc',
        wip_limit: null,
        is_done: true,
        position: 2,
        tasks: [],
      },
    ] as ColumnWithTasks[],
  }
}

// Helpers to discriminate between the two sortable registrations inside
// BoardView: the column sortable filters '.kanban-column__tasks'; the task
// sortable (inside KanbanColumn) uses group:'tasks'. With shallowMount,
// KanbanColumn is stubbed so only the column sortable registers in BoardView.

function findColumnSortable(calls: CapturedSortable[]): CapturedSortable {
  const found = calls.find((c) => c.options.filter === '.kanban-column__tasks')
  if (!found) throw new Error('Column sortable not captured — check useSortable mock')
  return found
}

function findTaskSortable(calls: CapturedSortable[]): CapturedSortable {
  const found = calls.find((c) => c.options.group === 'tasks')
  if (!found) throw new Error('Task sortable not captured — check useSortable mock')
  return found
}

// ─── SCN-D1  Column reorder wiring ───────────────────────────────────────────

describe('SCN-D1 — column onEnd calls reorderColumns with new id order', () => {
  let store: ReturnType<typeof useCurrentBoardStore>
  let reorderSpy: MockInstance

  beforeEach(async () => {
    sortableCalls.length = 0

    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeThreeColumnBoard()

    vi.mocked(api.boards.getBoard).mockResolvedValue(makeThreeColumnBoard() as never)
    vi.mocked(api.columns.reorderColumns).mockResolvedValue(undefined as never)

    reorderSpy = vi.spyOn(store, 'reorderColumns')

    shallowMount(BoardView, {
      global: { plugins: [pinia] },
    })

    await flushPromises()
  })

  it('calls reorderColumns once with the reordered column ids', async () => {
    const { list, options } = findColumnSortable(sortableCalls)

    // Simulate SortableJS reordering: move column at index 0 to index 2
    // (Backlog → end: [10, 11, 12] → [11, 12, 10])
    const cols = list as Ref<ColumnWithTasks[]>
    const reordered = [cols.value[1], cols.value[2], cols.value[0]]
    cols.value = reordered

    options.onEnd!({})

    await flushPromises()

    expect(reorderSpy).toHaveBeenCalledOnce()
    expect(reorderSpy).toHaveBeenCalledWith([11, 12, 10])
  })

  it('store columns reflect the new order after reorderColumns resolves', async () => {
    const { list, options } = findColumnSortable(sortableCalls)

    const cols = list as Ref<ColumnWithTasks[]>
    const reordered = [cols.value[2], cols.value[0], cols.value[1]]
    cols.value = reordered

    options.onEnd!({})
    await flushPromises()

    // The store's board.columns should be in the order that reorderColumns applied
    const storeIds = store.board?.columns.map((c) => c.id)
    expect(storeIds).toEqual([12, 10, 11])
  })
})

// ─── SCN-D2  KanbanColumn task onEnd → emit ───────────────────────────────────

describe('SCN-D2 — KanbanColumn task onEnd emits moveTask with correct args', () => {
  beforeEach(() => {
    sortableCalls.length = 0
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.resetAllMocks()
  })

  function makeItemEl(taskId: string): HTMLElement {
    const el = document.createElement('div')
    el.dataset.taskId = taskId
    return el
  }

  function makeTargetEl(columnId: string): HTMLElement {
    const el = document.createElement('div')
    el.dataset.columnId = columnId
    return el
  }

  function makeSortableEvent(taskId: string, columnId: string, newIndex: number) {
    return {
      item: makeItemEl(taskId),
      to: makeTargetEl(columnId),
      newIndex,
    } as SortableEvent
  }

  it('emits moveTask with [taskId, toColumnId, toPosition] on drop', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: {
        column: makeThreeColumnBoard().columns[0],
      },
      global: { plugins: [pinia] },
    })

    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)

    options.onEnd!(makeSortableEvent('100', '11', 2))

    const emitted = wrapper.emitted<[number, number, number][]>('moveTask')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([100, 11, 2])
  })

  it('emits moveTask at position 0 when newIndex is 0', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: {
        column: makeThreeColumnBoard().columns[0],
      },
      global: { plugins: [pinia] },
    })

    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)
    options.onEnd!(makeSortableEvent('100', '11', 0))

    const emitted = wrapper.emitted<[number, number, number][]>('moveTask')
    expect(emitted![0]).toEqual([100, 11, 0])
  })
})

// ─── SCN-D3  BoardView @move-task binding → store.moveTask ───────────────────

describe('SCN-D3 — BoardView move-task event calls currentBoardStore.moveTask', () => {
  let store: ReturnType<typeof useCurrentBoardStore>
  let moveTaskSpy: MockInstance

  beforeEach(async () => {
    sortableCalls.length = 0

    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeThreeColumnBoard()

    vi.mocked(api.boards.getBoard).mockResolvedValue(makeThreeColumnBoard() as never)
    vi.mocked(api.tasks.moveTask).mockResolvedValue(undefined as never)

    moveTaskSpy = vi.spyOn(store, 'moveTask')
  })

  it('calls moveTask(taskId, toColumnId, toPosition) when KanbanColumn emits move-task', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useCurrentBoardStore()
    store.board = makeThreeColumnBoard()
    moveTaskSpy = vi.spyOn(store, 'moveTask')

    vi.mocked(api.tasks.moveTask).mockResolvedValue(undefined as never)

    // Use shallowMount — KanbanColumn stub still emits native events through vm.$emit
    const wrapper = shallowMount(BoardView, {
      global: { plugins: [pinia] },
    })

    await flushPromises()

    // Find the stubbed KanbanColumn and emit the move-task event to trigger handleMoveTask
    const columnStub = wrapper.findComponent(KanbanColumn)
    expect(columnStub.exists()).toBe(true)

    await columnStub.vm.$emit('moveTask', 100, 11, 2)

    await flushPromises()

    expect(moveTaskSpy).toHaveBeenCalledOnce()
    expect(moveTaskSpy).toHaveBeenCalledWith(100, 11, 2)
  })
})

// ─── SCN-D4  KanbanColumn guard: missing dataset → no emit ───────────────────

describe('SCN-D4 — KanbanColumn onEnd guard: missing dataset does not emit moveTask', () => {
  beforeEach(() => {
    sortableCalls.length = 0
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  it('does not emit when taskId dataset is absent', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: { column: makeThreeColumnBoard().columns[0] },
      global: { plugins: [pinia] },
    })

    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)

    // item has no data-task-id → Number('') === 0 → guard fires
    const toEl = document.createElement('div')
    toEl.dataset.columnId = '11'
    options.onEnd!({
      item: document.createElement('div') as HTMLElement,
      to: toEl,
      newIndex: 0,
    })

    expect(wrapper.emitted('moveTask')).toBeFalsy()
  })

  it('does not emit when toColumnId dataset is absent', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: { column: makeThreeColumnBoard().columns[0] },
      global: { plugins: [pinia] },
    })

    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)

    const itemEl = document.createElement('div')
    itemEl.dataset.taskId = '100'
    options.onEnd!({
      item: itemEl,
      to: document.createElement('div') as HTMLElement,
      newIndex: 0,
    })

    expect(wrapper.emitted('moveTask')).toBeFalsy()
  })
})

// ─── SCN-D5  cross-column drop reverts SortableJS DOM move (duplicate-card bug) ─
//
// Bug: dropping a task onto another column showed the card duplicated until F5.
// SortableJS physically transplants the <li> into the target column's DOM, but
// Vue still owns that node and the store re-renders the card in the target —
// two cards. onEnd must move the node back so Vue's reactive render is sole truth.
// jsdom can't reproduce the visual duplicate, but it locks the revert logic.

describe('SCN-D5 — cross-column onEnd reverts the transplanted DOM node', () => {
  beforeEach(() => {
    sortableCalls.length = 0
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  it('moves the item node back under `from` on cross-column drop, and still emits', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: { column: makeThreeColumnBoard().columns[0] },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)

    // Simulate SortableJS having already transplanted the <li> from source → target.
    const fromEl = document.createElement('ul')
    const toEl = document.createElement('ul')
    toEl.dataset.columnId = '11'
    const item = document.createElement('li')
    item.dataset.taskId = '100'
    toEl.appendChild(item) // node currently lives in the TARGET (the duplicate)

    options.onEnd!({ item, from: fromEl, to: toEl, oldIndex: 0, newIndex: 1 })

    // Reverted: node back under `from`, gone from `to`.
    expect(item.parentElement).toBe(fromEl)
    expect(toEl.contains(item)).toBe(false)
    // Store still told to perform the move.
    const emitted = wrapper.emitted<[number, number, number][]>('moveTask')
    expect(emitted![0]).toEqual([100, 11, 1])
  })

  it('does NOT touch the DOM on same-column reorder (to === from)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(KanbanColumn, {
      props: { column: makeThreeColumnBoard().columns[0] },
      global: { plugins: [pinia] },
    })
    await flushPromises()

    const { options } = findTaskSortable(sortableCalls)

    const listEl = document.createElement('ul')
    listEl.dataset.columnId = '11'
    const item = document.createElement('li')
    item.dataset.taskId = '100'
    listEl.appendChild(item)

    // Same-column: to === from. Must leave DOM alone (vueuse onUpdate owns it).
    options.onEnd!({ item, from: listEl, to: listEl, oldIndex: 0, newIndex: 2 })

    expect(item.parentElement).toBe(listEl)
    const emitted = wrapper.emitted<[number, number, number][]>('moveTask')
    expect(emitted![0]).toEqual([100, 11, 2])
  })
})
