/**
 * ICT-85 — TaskDrawer (now a centered modal Dialog) tests.
 *
 * SCN-5  Edit modal populates title / description / priority chip / due date / column from
 *        a snake_case task fixture (field-populate verification).
 * SCN-6  Column change in the edit modal calls boardStore.moveTask.
 * SCN-7  A centered Dialog (.tn-dialog) is rendered — not a side Drawer (.tn-drawer).
 * SCN-8  Clicking a priority chip in create mode sets it active.
 * SCN-9  Edit modal priority chip reflects saved priority value.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ─── Module mocks (must appear before any imports that pull these in) ──────────

vi.mock('@/features/editor/MilkdownEditor.vue', () => ({
  default: {
    name: 'MilkdownEditor',
    template: '<div class="milkdown-stub" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
}))

vi.mock('@/features/tags/TagPicker.vue', () => ({
  default: {
    name: 'TagPicker',
    template: '<div />',
    props: ['modelValue', 'taskId'],
  },
}))

// ─── Stores accessed via real Pinia (currentBoard, notes, fileRefs, tags) ──────

// We let the real stores run but mock the API module they call internally.

vi.mock('@/api', () => ({
  tasks: {
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    moveTask: vi.fn(),
  },
  notes: { forTask: vi.fn().mockResolvedValue([]) },
  fileRefs: { loadFor: vi.fn().mockResolvedValue([]) },
}))

// ─── Imports (after vi.mock calls) ────────────────────────────────────────────

import { useCurrentBoardStore } from '@/stores/currentBoard'
import * as api from '@/api'
import TaskDrawer from '../TaskDrawer.vue'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    column_id: 11,
    title: 'Fix login bug',
    description_md: 'Some description',
    priority: 'high' as const,
    due_date: '2026-06-15T12:00:00.000Z',
    position: 0,
    archived_at: null,
    completed_at: null,
    committed_on: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tag_ids: [],
    ...overrides,
  }
}

function makeBoard() {
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
        color: '#aaa',
        wip_limit: null,
        is_done: false,
        position: 0,
        tasks: [],
      },
      {
        id: 11,
        board_id: 1,
        name: 'Doing',
        color: '#bbb',
        wip_limit: null,
        is_done: false,
        position: 1,
        tasks: [makeTask()],
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
    ],
  }
}

// ─── Mount helper ─────────────────────────────────────────────────────────────

function mountDrawer(props: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const boardStore = useCurrentBoardStore()
  boardStore.board = makeBoard() as never

  const wrapper = mount(TaskDrawer, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        // Stub store-specific sub-tabs so they don't pull in more deps
        TaskNotesTab: { template: '<div class="notes-stub" />', props: ['taskId', 'notes'] },
        TaskFilesTab: { template: '<div class="files-stub" />', props: ['taskId', 'fileRefs'] },
      },
    },
    props: props as never,
  })

  return { wrapper, boardStore, pinia }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskDrawer — ICT-85 (SCN-7) modal vs drawer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders a centered Dialog (.tn-dialog), not a side Drawer (.tn-drawer)', async () => {
    const { wrapper } = mountDrawer({
      open: true,
      taskId: null,
      newTaskDefaults: { columnId: 10, priority: 'low' },
    })
    await flushPromises()

    // The Dialog portal mounts into document.body
    expect(document.body.querySelector('.tn-dialog')).not.toBeNull()
    expect(document.body.querySelector('.tn-drawer')).toBeNull()

    wrapper.unmount()
  })
})

describe('TaskDrawer — ICT-85 (SCN-5) edit modal field population', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('populates title, priority chip, due date and column from a snake_case task fixture', async () => {
    const task = makeTask({
      id: 42,
      title: 'Fix login bug',
      priority: 'high',
      due_date: '2026-06-15T12:00:00.000Z',
      column_id: 11,
    })
    vi.mocked(api.tasks.getTask).mockResolvedValue(task as never)

    const pinia = createPinia()
    setActivePinia(pinia)
    const boardStore = useCurrentBoardStore()
    boardStore.board = makeBoard() as never

    const wrapper = mount(TaskDrawer, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: {
          TaskNotesTab: { template: '<div />', props: ['taskId', 'notes'] },
          TaskFilesTab: { template: '<div />', props: ['taskId', 'fileRefs'] },
        },
      },
      props: { open: true, taskId: 42 },
    })
    await flushPromises()

    // Priority chip "High" should be active (aria-checked=true) in the dialog
    const dialogEl = document.body.querySelector('.tn-dialog')
    expect(dialogEl).not.toBeNull()
    const highChip = [...(dialogEl!.querySelectorAll('[role="radio"]'))].find(
      (el) => el.textContent?.trim() === 'High'
    ) as HTMLElement | undefined
    expect(highChip).toBeDefined()
    expect(highChip!.getAttribute('aria-checked')).toBe('true')

    const lowChip = [...(dialogEl!.querySelectorAll('[role="radio"]'))].find(
      (el) => el.textContent?.trim() === 'Low'
    ) as HTMLElement | undefined
    expect(lowChip!.getAttribute('aria-checked')).toBe('false')

    // Due date: TaskDetailsTab's DatePicker must receive the sliced YYYY-MM-DD value.
    // The watcher reads t.due_date.slice(0,10) — verify the prop flows down correctly.
    const { default: DatePicker } = await import('@tasknote/ui').then(
      (m) => ({ default: m.DatePicker })
    )
    const datePicker = wrapper.findComponent(DatePicker)
    expect(datePicker.exists()).toBe(true)
    expect(datePicker.props('modelValue')).toBe('2026-06-15')

    // Column: TaskDetailsTab's column Select must receive task.column_id (11 = Doing).
    const { default: Select } = await import('@tasknote/ui').then(
      (m) => ({ default: m.Select })
    )
    // There may be more than one Select (create column + task-column); the column select
    // is the one with id="task-column"
    const allSelects = wrapper.findAllComponents(Select)
    const columnSelect = allSelects.find((s) => s.props('id') === 'task-column')
    expect(columnSelect).toBeDefined()
    expect(columnSelect!.props('modelValue')).toBe(11)

    // Title: verify via the input element in the portal DOM
    const titleInput = dialogEl!.querySelector('input[placeholder="Task title"]') as HTMLInputElement | null
    expect(titleInput).not.toBeNull()
    expect(titleInput!.value).toBe('Fix login bug')

    wrapper.unmount()
  })

  it('SCN-9: shows the "Medium" chip as active for a task with priority medium', async () => {
    const task = makeTask({ id: 43, priority: 'medium', column_id: 10 })
    vi.mocked(api.tasks.getTask).mockResolvedValue(task as never)

    const { wrapper } = mountDrawer({ open: true, taskId: 43 })
    await flushPromises()

    const dialogEl = document.body.querySelector('.tn-dialog')!
    const mediumChip = [...dialogEl.querySelectorAll('[role="radio"]')].find(
      (el) => el.textContent?.trim() === 'Medium'
    ) as HTMLElement | undefined
    expect(mediumChip).toBeDefined()
    expect(mediumChip!.getAttribute('aria-checked')).toBe('true')

    wrapper.unmount()
  })
})

describe('TaskDrawer — ICT-85 (SCN-6) column change calls moveTask', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('calls boardStore.moveTask when TaskDetailsTab emits column-change', async () => {
    const task = makeTask({ id: 42, column_id: 11 })
    vi.mocked(api.tasks.getTask).mockResolvedValue(task as never)

    const pinia = createPinia()
    setActivePinia(pinia)
    const boardStore = useCurrentBoardStore()
    boardStore.board = makeBoard() as never
    const moveSpy = vi.spyOn(boardStore, 'moveTask').mockResolvedValue(undefined as never)

    // Stub TaskDetailsTab so we can trigger the column-change event manually
    const wrapper = mount(TaskDrawer, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: {
          TaskDetailsTab: {
            name: 'TaskDetailsTab',
            template: '<div class="details-stub" />',
            props: ['task', 'title', 'descMd', 'priority', 'dueDate', 'columns'],
            emits: ['update:title', 'update:descMd', 'update:priority', 'update:dueDate', 'columnChange', 'archive'],
          },
          TaskNotesTab: { template: '<div />', props: ['taskId', 'notes'] },
          TaskFilesTab: { template: '<div />', props: ['taskId', 'fileRefs'] },
        },
      },
      props: { open: true, taskId: 42 },
    })

    await flushPromises()

    // Trigger column-change by finding the stubbed TaskDetailsTab and emitting
    const detailsStub = wrapper.findComponent({ name: 'TaskDetailsTab' })
    expect(detailsStub.exists()).toBe(true)

    // Simulate a column change event: emit columnChange with a fake Event (column 12 = Done)
    await detailsStub.vm.$emit('columnChange', {
      target: { value: '12' },
    } as unknown as Event)
    await flushPromises()

    expect(moveSpy).toHaveBeenCalledWith(42, 12, 0)

    wrapper.unmount()
  })
})

describe('TaskDrawer — ICT-85 (SCN-8) priority chip in create mode', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('clicking the "Urgent" chip makes it the active chip', async () => {
    const { wrapper } = mountDrawer({
      open: true,
      taskId: null,
      newTaskDefaults: { columnId: 10, priority: 'low' },
    })
    await flushPromises()

    const dialogEl = document.body.querySelector('.tn-dialog')!

    // Initial state: "Low" should be active
    const lowChip = [...dialogEl.querySelectorAll('[role="radio"]')].find(
      (el) => el.textContent?.trim() === 'Low'
    ) as HTMLElement | undefined
    expect(lowChip!.getAttribute('aria-checked')).toBe('true')

    // Click "Urgent"
    const urgentChip = [...dialogEl.querySelectorAll('[role="radio"]')].find(
      (el) => el.textContent?.trim() === 'Urgent'
    ) as HTMLElement | undefined
    expect(urgentChip).toBeDefined()
    await urgentChip!.click()
    await flushPromises()

    // "Urgent" should now be active
    expect(urgentChip!.getAttribute('aria-checked')).toBe('true')
    // "Low" should no longer be active
    expect(lowChip!.getAttribute('aria-checked')).toBe('false')

    wrapper.unmount()
  })
})
