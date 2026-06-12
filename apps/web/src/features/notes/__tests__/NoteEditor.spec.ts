import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NoteEditor from '../NoteEditor.vue'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'note-detail', params: { id: '1' } }),
}))

vi.mock('@tasknote/ui', () => ({
  Button: {
    name: 'Button',
    template: '<button type="button" :disabled="disabled" v-bind="$attrs"><slot /></button>',
    props: ['variant', 'size', 'disabled'],
  },
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/features/editor/MilkdownEditor.vue', () => ({
  default: {
    name: 'MilkdownEditor',
    template: '<div class="milkdown-editor-stub" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
}))

vi.mock('../TaskLinkPicker.vue', () => ({
  default: {
    name: 'TaskLinkPicker',
    template: '<div class="task-link-picker-stub" />',
    props: ['linkedTaskId'],
    emits: ['select'],
  },
}))

vi.mock('@/api', () => ({
  notes: {
    listNotes: vi.fn().mockResolvedValue([]),
    getNote: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    restoreNote: vi.fn(),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

interface NoteStub {
  id: number
  title: string
  body_md: string
  pinned: boolean
  updated_at: string
  created_at: string
  task_id: number | null
  archived_at: string | null
}

function makeNote(overrides: Partial<NoteStub> = {}): NoteStub {
  return {
    id: 1,
    title: 'My Note',
    body_md: 'Hello world',
    pinned: false,
    updated_at: new Date().toISOString(),
    created_at: new Date('2025-01-01').toISOString(),
    task_id: null,
    archived_at: null,
    ...overrides,
  }
}

async function mountEditor(noteId: number | null, storeNotes: NoteStub[] = []) {
  const { notes: apiNotes } = await import('@/api')
  vi.mocked(apiNotes.listNotes).mockResolvedValue(storeNotes as never[])

  const pinia = createPinia()
  setActivePinia(pinia)

  // Pre-populate the store so the watch can resolve from cache
  const { useNotesStore } = await import('@/stores/notes')
  const store = useNotesStore()
  // Manually seed list to avoid waiting for load
  store.list.splice(0, store.list.length, ...(storeNotes as never[]))

  const wrapper = mount(NoteEditor, {
    global: { plugins: [pinia] },
    props: { noteId },
  })

  await flushPromises()
  return { wrapper, store }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NoteEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ── Empty state ───────────────────────────────────────────────────────────

  // BDD: when noteId is null, show the empty-state panel
  it('renders empty state when noteId is null', async () => {
    const { wrapper } = await mountEditor(null)

    expect(wrapper.find('.note-editor--empty').exists()).toBe(true)
    expect(wrapper.find('.note-editor__empty-prompt').text()).toBeTruthy()
    // Editor header should not be present
    expect(wrapper.find('.note-editor__header').exists()).toBe(false)
  })

  // ── Pin button aria-pressed ───────────────────────────────────────────────

  // BDD: pin button has aria-pressed="true" when note is pinned
  it('pin button has aria-pressed="true" when note is pinned', async () => {
    const note = makeNote({ id: 1, title: 'Pinned note', pinned: true })
    const { wrapper } = await mountEditor(1, [note])

    const pinBtn = wrapper.find('[aria-label="Unpin note"]')
    expect(pinBtn.exists()).toBe(true)
    // aria-pressed is bound as a boolean in the component; test-utils serializes it
    const ariaPressed = pinBtn.attributes('aria-pressed')
    expect(ariaPressed === 'true' || ariaPressed === '').toBeTruthy()
  })

  // BDD: pin button has aria-pressed="false" / not-pressed when note is not pinned
  it('pin button has aria-pressed="false" when note is not pinned', async () => {
    const note = makeNote({ id: 2, title: 'Unpinned note', pinned: false })
    const { wrapper } = await mountEditor(2, [note])

    const pinBtn = wrapper.find('[aria-label="Pin note"]')
    expect(pinBtn.exists()).toBe(true)
    const ariaPressed = pinBtn.attributes('aria-pressed')
    expect(ariaPressed === 'false' || ariaPressed === undefined).toBeTruthy()
  })

  // ── Save button disabled/enabled state ───────────────────────────────────

  // BDD: save button is disabled when note is not dirty (clean state)
  it('save button is disabled when note is clean (not dirty)', async () => {
    const note = makeNote({ id: 3, title: 'Clean note', body_md: 'Body content' })
    const { wrapper } = await mountEditor(3, [note])

    // The Button stub passes disabled as an HTML attribute
    const saveBtn = wrapper.find('button[disabled]')
    // Find the save button specifically by its text content
    const allBtns = wrapper.findAll('button')
    const saveButton = allBtns.find((b) => b.text() === 'Save')
    expect(saveButton).toBeDefined()
    expect(saveButton!.attributes('disabled')).toBeDefined()
  })

  // BDD: save button is enabled when note is dirty (has unsaved changes)
  it('save button is enabled when note has unsaved changes (dirty)', async () => {
    const note = makeNote({ id: 4, title: 'Editable note', body_md: 'Original content' })
    const { wrapper } = await mountEditor(4, [note])

    // Simulate typing in the title input to make the note dirty
    const titleInput = wrapper.find('.note-editor__title-input')
    expect(titleInput.exists()).toBe(true)
    await titleInput.setValue('Changed title')
    await wrapper.vm.$nextTick()

    const allBtns = wrapper.findAll('button')
    const saveButton = allBtns.find((b) => b.text() === 'Save')
    expect(saveButton).toBeDefined()
    expect(saveButton!.attributes('disabled')).toBeUndefined()
  })

  // ── Save status indicator ─────────────────────────────────────────────────

  // BDD: save status indicator shows "Unsaved" when note is dirty
  it('save status indicator shows "Unsaved" text when note is dirty', async () => {
    const note = makeNote({ id: 5, title: 'Status note', body_md: 'Body' })
    const { wrapper } = await mountEditor(5, [note])

    // Initially shows "Saved"
    expect(wrapper.find('.note-editor__save-indicator').text()).toContain('Saved')

    // Make it dirty
    const titleInput = wrapper.find('.note-editor__title-input')
    await titleInput.setValue('Modified title')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.note-editor__save-indicator').text()).toContain('Unsaved')
  })

  // BDD: save-status indicator has aria-live="polite" for screen readers
  it('save-status indicator has aria-live="polite" and aria-atomic="true"', async () => {
    const note = makeNote({ id: 6, title: 'Aria note' })
    const { wrapper } = await mountEditor(6, [note])

    const indicator = wrapper.find('.note-editor__save-indicator')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('aria-live')).toBe('polite')
    expect(indicator.attributes('aria-atomic')).toBe('true')
  })

  // ── Two-step delete flow ──────────────────────────────────────────────────

  // BDD: clicking the delete button reveals the inline confirm UI
  it('clicking the delete button shows the inline confirm UI', async () => {
    const note = makeNote({ id: 7, title: 'Delete me' })
    const { wrapper } = await mountEditor(7, [note])

    // Delete button is visible initially
    const deleteBtn = wrapper.find('[aria-label="Delete note"]')
    expect(deleteBtn.exists()).toBe(true)

    // Confirm prompt not shown yet
    expect(wrapper.find('.note-editor__confirm-text').exists()).toBe(false)

    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Inline confirm appears
    expect(wrapper.find('.note-editor__confirm-text').exists()).toBe(true)
    expect(wrapper.find('.note-editor__confirm-text').text()).toContain('Delete')

    // Original delete button gone
    expect(wrapper.find('[aria-label="Delete note"]').exists()).toBe(false)
  })

  // BDD: confirming the delete calls store softDelete
  it('confirming delete calls store softDelete with the note id', async () => {
    const { notes: apiNotes } = await import('@/api')
    const note = makeNote({ id: 8, title: 'Confirm delete' })
    const { wrapper } = await mountEditor(8, [note])

    // Trigger initial delete click to show confirm
    await wrapper.find('[aria-label="Delete note"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Click the confirm "Delete" button
    const allBtns = wrapper.findAll('button')
    const confirmDeleteBtn = allBtns.find((b) => b.text() === 'Delete')
    expect(confirmDeleteBtn).toBeDefined()
    await confirmDeleteBtn!.trigger('click')
    await flushPromises()

    expect(apiNotes.deleteNote).toHaveBeenCalledWith(8)
  })
})
