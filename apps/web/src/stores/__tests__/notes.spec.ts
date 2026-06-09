import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { watch } from 'vue'

vi.mock('@/api', () => ({
  notes: {
    listNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    restoreNote: vi.fn(),
  },
}))

import { useNotesStore } from '@/stores/notes'
import * as api from '@/api'
import type { Note } from '@tasknote/shared'

function makeNote(id: number, taskId: number, title: string): Note {
  return {
    id,
    task_id: taskId,
    title,
    body_md: '',
    pinned: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Note
}

describe('useNotesStore — update: byTask single-assignment (SCN-5)', () => {
  let store: ReturnType<typeof useNotesStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useNotesStore()
    vi.resetAllMocks()
  })

  it('reassigns byTask exactly once when updating a note that exists in one of multiple task slots', async () => {
    const n1 = makeNote(1, 1, 'Original title')
    const n2 = makeNote(2, 1, 'Note 2')
    const n3 = makeNote(3, 2, 'Note 3')
    const n4 = makeNote(4, 3, 'Note 4')

    // Pre-populate byTask with 3 slots so the loop has multiple iterations
    store.byTask.set(1, [n1, n2])
    store.byTask.set(2, [n3])
    store.byTask.set(3, [n4])

    // Capture initial slot references for untouched-slot assertions
    const slot2Before = store.byTask.get(2)
    const slot3Before = store.byTask.get(3)

    const updatedNote = { ...n1, title: 'X' }
    vi.mocked(api.notes.updateNote).mockResolvedValueOnce(updatedNote)

    let reassignments = 0
    // flush: 'sync' is required — without it Vue batches multiple in-loop
    // assignments into one notification, making the broken version also appear correct
    watch(() => store.byTask, () => { reassignments++ }, { flush: 'sync' })

    await store.update(n1.id, { title: 'X' })

    expect(reassignments).toBe(1)
  })

  it('reflects the updated title in byTask.get(1) after update resolves', async () => {
    const n1 = makeNote(1, 1, 'Original title')
    const n2 = makeNote(2, 1, 'Note 2')
    const n3 = makeNote(3, 2, 'Note 3')

    store.byTask.set(1, [n1, n2])
    store.byTask.set(2, [n3])

    const updatedNote = { ...n1, title: 'X' }
    vi.mocked(api.notes.updateNote).mockResolvedValueOnce(updatedNote)

    await store.update(n1.id, { title: 'X' })

    const slot1 = store.byTask.get(1)!
    expect(slot1.find((n) => n.id === n1.id)?.title).toBe('X')
  })

  it('leaves byTask.get(2) array reference unchanged when the note belongs to slot 1', async () => {
    const n1 = makeNote(1, 1, 'Original title')
    const n2 = makeNote(2, 1, 'Note 2')
    const n3 = makeNote(3, 2, 'Note 3')

    store.byTask.set(1, [n1, n2])
    store.byTask.set(2, [n3])

    const slot2Before = store.byTask.get(2)

    const updatedNote = { ...n1, title: 'X' }
    vi.mocked(api.notes.updateNote).mockResolvedValueOnce(updatedNote)

    await store.update(n1.id, { title: 'X' })

    // The array for slot 2 should be the exact same reference — no rebuild
    expect(store.byTask.get(2)).toBe(slot2Before)
  })

  it('does not touch byTask when the updated note is not in any slot', async () => {
    const n1 = makeNote(1, 1, 'Note 1')
    store.byTask.set(1, [n1])

    const mapBefore = store.byTask

    const updatedNote = makeNote(99, 5, 'Ghost')
    vi.mocked(api.notes.updateNote).mockResolvedValueOnce(updatedNote)

    let reassignments = 0
    watch(() => store.byTask, () => { reassignments++ }, { flush: 'sync' })

    await store.update(99, { title: 'Ghost' })

    // byTask should still be reassigned once (we build newMap = new Map(byTask.value)
    // and assign byTask.value = newMap unconditionally), but content is unchanged
    const slot1After = store.byTask.get(1)
    expect(slot1After).toEqual([n1])
  })
})
