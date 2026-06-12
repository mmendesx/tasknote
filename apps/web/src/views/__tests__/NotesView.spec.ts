/**
 * NotesView — wiring tests
 *
 * Verifies that the `create` emit from NoteList and NoteEditor each
 * invoke the store's create action and navigate to the new note route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before lazy imports
// ---------------------------------------------------------------------------

vi.mock('@/api', () => ({
  notes: {
    listNotes: vi.fn().mockResolvedValue([]),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    getNote: vi.fn(),
    restoreNote: vi.fn(),
  },
}))

vi.mock('@tasknote/ui', () => ({
  Button: { template: '<button><slot /></button>', props: ['variant', 'size', 'disabled'] },
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/features/notes/NoteList.vue', () => ({
  default: {
    name: 'NoteList',
    template: '<div data-testid="note-list" />',
    props: ['selectedId'],
    emits: ['select', 'deleted', 'create'],
  },
}))

vi.mock('@/features/notes/NoteEditor.vue', () => ({
  default: {
    name: 'NoteEditor',
    template: '<div data-testid="note-editor" />',
    props: ['noteId'],
    emits: ['deleted', 'create'],
  },
}))

vi.mock('@/features/notes/icons', () => ({
  IconBack: { template: '<svg />' },
}))

// ---------------------------------------------------------------------------
// Lazy imports after mocks
// ---------------------------------------------------------------------------

import { flushPromises as fp } from '@vue/test-utils'
import NotesView from '../NotesView.vue'
import NoteList from '@/features/notes/NoteList.vue'
import NoteEditor from '@/features/notes/NoteEditor.vue'
import { useNotesStore } from '@/stores/notes'
import * as api from '@/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRouter(initialPath = '/notes') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/notes', name: 'notes', component: { template: '<div />' } },
      { path: '/notes/:id', name: 'note-detail', component: { template: '<div />' } },
    ],
  })
}

async function mountView(initialPath = '/notes') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = buildRouter(initialPath)
  await router.push(initialPath)
  await router.isReady()

  const wrapper = mount(NotesView, {
    global: { plugins: [pinia, router] },
  })

  await flushPromises()
  return { wrapper, router, pinia }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotesView — NoteList @create wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls notesStore.create and navigates to the new note when NoteList emits create', async () => {
    const newNote = { id: 42, title: '', body_md: '', pinned: false, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), task_id: null, archived_at: null }
    vi.mocked(api.notes.createNote).mockResolvedValueOnce(newNote as never)

    const { wrapper, router } = await mountView()
    const notesStore = useNotesStore()

    await wrapper.findComponent(NoteList).vm.$emit('create')
    await flushPromises()

    expect(api.notes.createNote).toHaveBeenCalledWith({ body_md: '', title: '' })
    expect(router.currentRoute.value.name).toBe('note-detail')
    expect(router.currentRoute.value.params.id).toBe('42')
  })
})

describe('NotesView — NoteEditor @create wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls notesStore.create and navigates to the new note when NoteEditor emits create', async () => {
    const newNote = { id: 99, title: '', body_md: '', pinned: false, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), task_id: null, archived_at: null }
    vi.mocked(api.notes.createNote).mockResolvedValueOnce(newNote as never)

    const { wrapper, router } = await mountView()

    await wrapper.findComponent(NoteEditor).vm.$emit('create')
    await flushPromises()

    expect(api.notes.createNote).toHaveBeenCalledWith({ body_md: '', title: '' })
    expect(router.currentRoute.value.name).toBe('note-detail')
    expect(router.currentRoute.value.params.id).toBe('99')
  })
})
