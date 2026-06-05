import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DiagramList from '../DiagramList.vue'

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('@/api', () => ({
  diagrams: {
    listDiagrams: vi.fn().mockResolvedValue([]),
    createDiagram: vi.fn(),
    deleteDiagram: vi.fn().mockResolvedValue(undefined),
    getDiagram: vi.fn(),
    updateDiagram: vi.fn(),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

interface DiagramStub {
  id: number
  title: string
  updated_at: Date
  created_at: Date
  scene_json: {
    version: number
    elements: never[]
    appState: { viewport: { scrollX: number; scrollY: number; zoom: number } }
  }
}

function makeDiagram(id: number, title: string, updatedAt: Date): DiagramStub {
  return {
    id,
    title,
    updated_at: updatedAt,
    created_at: new Date('2025-01-01'),
    scene_json: {
      version: 1,
      elements: [],
      appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } },
    },
  }
}

async function mountList(props: { selectedId: number | null } = { selectedId: null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(DiagramList, {
    global: { plugins: [pinia] },
    props,
  })

  await flushPromises()
  return { wrapper, pinia }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiagramList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // BDD: renders diagrams most-recently-updated first
  it('renders diagrams most-recently-updated first', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    // Seed in a non-recency order: oldest first in the API response
    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(1, 'Oldest', new Date('2025-01-01T10:00:00Z')),
      makeDiagram(2, 'Middle', new Date('2025-06-01T10:00:00Z')),
      makeDiagram(3, 'Newest', new Date('2026-01-01T10:00:00Z')),
    ] as never[])

    const { wrapper } = await mountList()

    const titles = wrapper.findAll('.diagram-item__title').map((el) => el.text())
    expect(titles).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  // BDD: shows "No diagrams yet" when list is empty
  it("shows 'No diagrams yet' when the list is empty", async () => {
    const { wrapper } = await mountList()

    expect(wrapper.text()).toContain('No diagrams yet')
  })

  // BDD: clicking a diagram row emits select
  it('clicking a diagram row emits select with the diagram id', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(7, 'My Flow', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    const openBtn = wrapper.find('.diagram-item__open')
    expect(openBtn.exists()).toBe(true)

    await openBtn.trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([7])
  })

  // BDD: clicking the rename button shows an editable input
  it('clicking the rename button shows an editable input', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(5, 'Untitled diagram', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    expect(wrapper.find('.diagram-item__rename-input').exists()).toBe(false)

    const renameBtn = wrapper.find('.diagram-item__action-btn')
    await renameBtn.trigger('click')

    const input = wrapper.find('.diagram-item__rename-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Untitled diagram')
    expect(input.attributes('aria-label')).toBe('Rename diagram')
  })

  // BDD: editing the title and pressing Enter persists via renameDiagram
  it('editing the title and pressing Enter persists via renameDiagram with the new title', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(5, 'Untitled diagram', new Date('2026-01-01')),
    ] as never[])

    vi.mocked(apiDiagrams.updateDiagram).mockResolvedValueOnce(
      makeDiagram(5, 'Auth flow', new Date('2026-01-02')) as never,
    )

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-item__action-btn').trigger('click')

    const input = wrapper.find('.diagram-item__rename-input')
    await input.setValue('Auth flow')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(apiDiagrams.updateDiagram).toHaveBeenCalledWith(5, { title: 'Auth flow' })
    // Input is dismissed and the new title is shown
    expect(wrapper.find('.diagram-item__rename-input').exists()).toBe(false)
    expect(wrapper.find('.diagram-item__title').text()).toBe('Auth flow')
  })

  // BDD: pressing Escape cancels the rename without persisting
  it('pressing Escape cancels the rename without persisting', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(3, 'My diagram', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-item__action-btn').trigger('click')

    const input = wrapper.find('.diagram-item__rename-input')
    await input.setValue('Something else')
    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(apiDiagrams.updateDiagram).not.toHaveBeenCalled()
    expect(wrapper.find('.diagram-item__rename-input').exists()).toBe(false)
    // Original title is preserved
    expect(wrapper.find('.diagram-item__title').text()).toBe('My diagram')
  })

  // BDD: committing an empty title sends empty to the store (backend resolves to 'Untitled diagram')
  it("committing an empty title sends empty to renameDiagram and shows the server-resolved title", async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(8, 'Some title', new Date('2026-01-01')),
    ] as never[])

    // Backend resolves empty title to 'Untitled diagram'
    vi.mocked(apiDiagrams.updateDiagram).mockResolvedValueOnce(
      makeDiagram(8, 'Untitled diagram', new Date('2026-01-02')) as never,
    )

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-item__action-btn').trigger('click')

    const input = wrapper.find('.diagram-item__rename-input')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    // Store is called even for empty string
    expect(apiDiagrams.updateDiagram).toHaveBeenCalledWith(8, { title: '' })
    // List reflects the server-resolved title
    expect(wrapper.find('.diagram-item__title').text()).toBe('Untitled diagram')
  })
})
