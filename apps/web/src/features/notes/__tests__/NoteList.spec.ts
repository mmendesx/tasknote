import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NoteList from '../NoteList.vue'

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('@/api', () => ({
  notes: {
    listNotes: vi.fn().mockResolvedValue([]),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    getNote: vi.fn(),
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
    title: 'Test Note',
    body_md: 'Note body content here.',
    pinned: false,
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
    created_at: new Date('2025-01-01').toISOString(),
    task_id: null,
    archived_at: null,
    ...overrides,
  }
}

async function mountList(props: { selectedId: number | null } = { selectedId: null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(NoteList, {
    global: { plugins: [pinia] },
    props,
  })

  await flushPromises()
  return { wrapper, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NoteList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ── Full-mode row rendering ───────────────────────────────────────────────

  // BDD: full-mode row renders title, preview, time, pin indicator when pinned
  it('renders title, preview, and relative time for each note row', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 1, title: 'Shopping list', body_md: 'Milk, eggs, bread', updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }),
    ] as never[])

    const { wrapper } = await mountList()

    const item = wrapper.find('.note-item')
    expect(item.exists()).toBe(true)

    expect(item.find('.note-item__title').text()).toBe('Shopping list')
    expect(item.find('.note-item__preview').text()).toContain('Milk')
    expect(item.find('.note-item__time').text()).toMatch(/ago|just now/)
  })

  // BDD: pinned note shows pin indicator with accessible label
  it('shows pin indicator on pinned notes', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 2, title: 'Pinned note', pinned: true }),
      makeNote({ id: 3, title: 'Unpinned note', pinned: false }),
    ] as never[])

    const { wrapper } = await mountList()

    const items = wrapper.findAll('.note-item')
    expect(items).toHaveLength(2)

    const pinnedItem = items.find((el) => el.find('.note-item__title').text() === 'Pinned note')
    expect(pinnedItem).toBeDefined()
    expect(pinnedItem!.find('.note-item__pin').exists()).toBe(true)
    expect(pinnedItem!.find('.note-item__pin').attributes('aria-label')).toBe('Pinned')

    const unpinnedItem = items.find((el) => el.find('.note-item__title').text() === 'Unpinned note')
    expect(unpinnedItem).toBeDefined()
    expect(unpinnedItem!.find('.note-item__pin').exists()).toBe(false)
  })

  // ── Selected row ──────────────────────────────────────────────────────────

  // BDD: the selected note carries the note-item--selected modifier
  it('applies note-item--selected to the note matching selectedId', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 10, title: 'Selected note' }),
      makeNote({ id: 11, title: 'Other note', updated_at: new Date(Date.now() - 60000).toISOString() }),
    ] as never[])

    const { wrapper } = await mountList({ selectedId: 10 })

    const items = wrapper.findAll('.note-item')
    const selectedItems = items.filter((el) => el.classes('note-item--selected'))
    expect(selectedItems).toHaveLength(1)
    expect(selectedItems[0].find('.note-item__title').text()).toBe('Selected note')

    const other = items.find((el) => !el.classes('note-item--selected'))
    expect(other!.find('.note-item__title').text()).toBe('Other note')
  })

  // ── Delete button ─────────────────────────────────────────────────────────

  // BDD: each note row has a delete button (revealed on hover/focus-within via CSS)
  it('each note row has a delete button with an accessible aria-label', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 5, title: 'Deletable note' }),
    ] as never[])

    const { wrapper } = await mountList()

    const delBtn = wrapper.find('.note-item__del')
    expect(delBtn.exists()).toBe(true)
    expect(delBtn.attributes('aria-label')).toBe('Delete note: Deletable note')
  })

  // BDD: clicking the delete button calls store softDelete and emits deleted
  it('clicking the delete button calls softDelete and emits deleted', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 42, title: 'To delete' }),
    ] as never[])

    const { wrapper } = await mountList()

    await wrapper.find('.note-item__del').trigger('click')
    await flushPromises()

    expect(apiNotes.deleteNote).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('deleted')).toHaveLength(1)
    expect(wrapper.emitted('deleted')![0]).toEqual([42])
  })

  // ── Empty state ───────────────────────────────────────────────────────────

  // BDD: empty state shows icon, prompt text, and a create button
  it('shows empty state with icon, prompt, and create button when no notes exist', async () => {
    const { wrapper } = await mountList()

    const emptySection = wrapper.find('.note-list__empty')
    expect(emptySection.exists()).toBe(true)

    // Icon is rendered inside the empty section
    expect(emptySection.find('svg').exists()).toBe(true)

    // Prompt text present and non-empty
    const prompt = emptySection.find('.note-list__empty-text')
    expect(prompt.exists()).toBe(true)
    expect(prompt.text().length).toBeGreaterThan(0)

    // Create button
    const createBtn = emptySection.find('button')
    expect(createBtn.exists()).toBe(true)
    expect(createBtn.text()).toBeTruthy()
  })

  // BDD: clicking the create button in empty state emits create
  it('clicking the create button in empty state emits create', async () => {
    const { wrapper } = await mountList()

    const createBtn = wrapper.find('.note-list__empty button')
    expect(createBtn.exists()).toBe(true)
    await createBtn.trigger('click')

    expect(wrapper.emitted('create')).toBeTruthy()
  })

  // ── Loading skeleton ──────────────────────────────────────────────────────

  // BDD: loading state renders skeleton rows, not a "Loading…" text node
  it('renders skeleton rows (not a "Loading…" text) while loading', async () => {
    const { notes: apiNotes } = await import('@/api')

    // Hold the promise so loading stays true during the sync assertion window
    let resolveLoad!: (v: never[]) => void
    vi.mocked(apiNotes.listNotes).mockReturnValueOnce(
      new Promise<never[]>((res) => { resolveLoad = res }),
    )

    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(NoteList, {
      global: { plugins: [pinia] },
      props: { selectedId: null },
    })

    // Do not await flushPromises — still in loading state
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.note-list__skeleton').length).toBeGreaterThan(0)
    // No "Loading…" visible text
    expect(wrapper.text()).not.toContain('Loading…')

    resolveLoad([])
    await flushPromises()
  })

  // ── Compact contract ──────────────────────────────────────────────────────

  // BDD: note-item and all required BEM class names are present in the DOM
  // so DefaultLayout's :deep(.note-item*) sidebar overrides can target them
  it('produces note-item, note-item--selected, note-item__title, note-item__preview, note-item__time, note-item__pin in the DOM', async () => {
    const { notes: apiNotes } = await import('@/api')

    vi.mocked(apiNotes.listNotes).mockResolvedValueOnce([
      makeNote({ id: 99, title: 'Contract note', body_md: 'Preview text', pinned: true }),
    ] as never[])

    const { wrapper } = await mountList({ selectedId: 99 })

    // Base item class
    expect(wrapper.find('.note-item').exists()).toBe(true)
    // Selected modifier
    expect(wrapper.find('.note-item--selected').exists()).toBe(true)
    // Title
    expect(wrapper.find('.note-item__title').exists()).toBe(true)
    // Preview (hidden by CSS in sidebar, but present in DOM)
    expect(wrapper.find('.note-item__preview').exists()).toBe(true)
    // Time (hidden by CSS in sidebar, but present in DOM)
    expect(wrapper.find('.note-item__time').exists()).toBe(true)
    // Pin indicator (pinned=true above)
    expect(wrapper.find('.note-item__pin').exists()).toBe(true)
  })
})
