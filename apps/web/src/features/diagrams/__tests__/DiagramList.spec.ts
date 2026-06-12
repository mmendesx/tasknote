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

async function mountList(
  props: { selectedId: number | null; compact?: boolean } = { selectedId: null },
) {
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

  // ── Card grid rendering ───────────────────────────────────────────────────

  // BDD: renders N cards with titles and relative updated time
  it('renders a card for each diagram with its title and relative time', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    const now = Date.now()
    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(1, 'Auth flow', new Date(now - 2 * 3600 * 1000)),     // 2h ago
      makeDiagram(2, 'Onboarding', new Date(now - 5 * 60 * 1000)),      // 5m ago
    ] as never[])

    const { wrapper } = await mountList()

    const cards = wrapper.findAll('.diagram-card')
    expect(cards).toHaveLength(2)

    // Titles visible in the cards
    const titles = wrapper.findAll('.diagram-card__title').map((el) => el.text())
    expect(titles).toContain('Auth flow')
    expect(titles).toContain('Onboarding')

    // Relative time stamps visible
    const metas = wrapper.findAll('.diagram-card__meta').map((el) => el.text())
    expect(metas[0]).toMatch(/ago|just now/)
    expect(metas[1]).toMatch(/ago|just now/)
  })

  // BDD: renders diagrams most-recently-updated first
  it('renders diagrams most-recently-updated first', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(1, 'Oldest', new Date('2025-01-01T10:00:00Z')),
      makeDiagram(2, 'Middle', new Date('2025-06-01T10:00:00Z')),
      makeDiagram(3, 'Newest', new Date('2026-01-01T10:00:00Z')),
    ] as never[])

    const { wrapper } = await mountList()

    const titles = wrapper.findAll('.diagram-card__title').map((el) => el.text())
    expect(titles).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  // ── Empty state ───────────────────────────────────────────────────────────

  // BDD: empty state shows icon, prompt, and create button
  it('shows the empty-state icon, a prompt, and a create button when no diagrams exist', async () => {
    const { wrapper } = await mountList()

    // Icon wrapper — IconDiagramEmpty renders an <svg>
    const emptySection = wrapper.find('.diagram-list__empty')
    expect(emptySection.exists()).toBe(true)

    // Icon present as an svg inside the empty section
    expect(emptySection.find('svg').exists()).toBe(true)

    // One-line prompt
    const prompt = emptySection.find('.diagram-list__empty-prompt')
    expect(prompt.exists()).toBe(true)
    expect(prompt.text().length).toBeGreaterThan(0)

    // Create button
    const createBtn = emptySection.find('button')
    expect(createBtn.exists()).toBe(true)
    expect(createBtn.text()).toBeTruthy()
  })

  // BDD: clicking the create button in empty state emits create
  it('clicking the create button in the empty state emits create', async () => {
    const { wrapper } = await mountList()

    const createBtn = wrapper.find('.diagram-list__empty button')
    expect(createBtn.exists()).toBe(true)
    await createBtn.trigger('click')

    expect(wrapper.emitted('create')).toBeTruthy()
  })

  // ── Hover-revealed delete ─────────────────────────────────────────────────

  // BDD: delete button is present on each card (revealed via CSS, class-based test)
  it('each card has a delete button with the correct aria-label', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(9, 'My Diagram', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    const deleteBtn = wrapper.find('.diagram-card__delete-btn')
    expect(deleteBtn.exists()).toBe(true)
    expect(deleteBtn.attributes('aria-label')).toBe('Delete My Diagram')
  })

  // BDD: delete button is inside the actions overlay that is opacity-0 by default
  it('the actions overlay element exists and carries the reveal class on the card', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(3, 'Flow A', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    const actions = wrapper.find('.diagram-card__actions')
    expect(actions.exists()).toBe(true)
    // The parent card has the class that CSS uses for the hover rule
    const card = wrapper.find('.diagram-card')
    expect(card.exists()).toBe(true)
  })

  // ── Delete flow ───────────────────────────────────────────────────────────

  // BDD: clicking the delete button triggers the existing delete flow and emits deleted
  it('clicking the delete button calls removeDiagram and emits deleted with the diagram id', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(42, 'To be deleted', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-card__delete-btn').trigger('click')
    await flushPromises()

    expect(apiDiagrams.deleteDiagram).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('deleted')).toHaveLength(1)
    expect(wrapper.emitted('deleted')![0]).toEqual([42])
  })

  // ── Open / select flow ────────────────────────────────────────────────────

  // BDD: clicking a diagram card emits select with the diagram id
  it('clicking a diagram card emits select with the diagram id', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(7, 'My Flow', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    const openBtn = wrapper.find('.diagram-card__open')
    expect(openBtn.exists()).toBe(true)

    await openBtn.trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual([7])
  })

  // ── Rename flow ───────────────────────────────────────────────────────────

  // BDD: clicking the rename button shows an editable input
  it('clicking the rename button shows an editable input', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(5, 'Untitled diagram', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    expect(wrapper.find('.diagram-card__rename-input').exists()).toBe(false)

    const renameBtn = wrapper.find('.diagram-card__rename-btn')
    await renameBtn.trigger('click')

    const input = wrapper.find('.diagram-card__rename-input')
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

    await wrapper.find('.diagram-card__rename-btn').trigger('click')

    const input = wrapper.find('.diagram-card__rename-input')
    await input.setValue('Auth flow')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(apiDiagrams.updateDiagram).toHaveBeenCalledWith(5, { title: 'Auth flow' })
    expect(wrapper.find('.diagram-card__rename-input').exists()).toBe(false)
    expect(wrapper.find('.diagram-card__title').text()).toBe('Auth flow')
  })

  // BDD: pressing Escape cancels the rename without persisting
  it('pressing Escape cancels the rename without persisting', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(3, 'My diagram', new Date('2026-01-01')),
    ] as never[])

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-card__rename-btn').trigger('click')

    const input = wrapper.find('.diagram-card__rename-input')
    await input.setValue('Something else')
    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(apiDiagrams.updateDiagram).not.toHaveBeenCalled()
    expect(wrapper.find('.diagram-card__rename-input').exists()).toBe(false)
    expect(wrapper.find('.diagram-card__title').text()).toBe('My diagram')
  })

  // BDD: committing an empty title sends empty to the store (backend resolves to 'Untitled diagram')
  it('committing an empty title sends empty to renameDiagram and shows the server-resolved title', async () => {
    const { diagrams: apiDiagrams } = await import('@/api')

    vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
      makeDiagram(8, 'Some title', new Date('2026-01-01')),
    ] as never[])

    vi.mocked(apiDiagrams.updateDiagram).mockResolvedValueOnce(
      makeDiagram(8, 'Untitled diagram', new Date('2026-01-02')) as never,
    )

    const { wrapper } = await mountList()

    await wrapper.find('.diagram-card__rename-btn').trigger('click')

    const input = wrapper.find('.diagram-card__rename-input')
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(apiDiagrams.updateDiagram).toHaveBeenCalledWith(8, { title: '' })
    expect(wrapper.find('.diagram-card__title').text()).toBe('Untitled diagram')
  })

  // ── Compact mode ──────────────────────────────────────────────────────────

  describe('compact prop', () => {
    // BDD: Given compact=true, When rendered with diagrams,
    // Then rows use diagram-item classes, not card grid classes
    it('renders diagram-item list tiles instead of diagram-card grid when compact=true', async () => {
      const { diagrams: apiDiagrams } = await import('@/api')

      vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
        makeDiagram(1, 'Flow A', new Date('2026-01-01')),
        makeDiagram(2, 'Flow B', new Date('2026-01-02')),
      ] as never[])

      const { wrapper } = await mountList({ selectedId: null, compact: true })

      // List tile elements present
      expect(wrapper.findAll('.diagram-item')).toHaveLength(2)

      // Titles visible via diagram-item__title
      const titles = wrapper.findAll('.diagram-item__title').map((el) => el.text())
      expect(titles).toContain('Flow A')
      expect(titles).toContain('Flow B')

      // No card grid or updated-time meta
      expect(wrapper.find('.diagram-grid').exists()).toBe(false)
      expect(wrapper.find('.diagram-card').exists()).toBe(false)
      expect(wrapper.find('.diagram-card__meta').exists()).toBe(false)
    })

    // BDD: Given compact=true and selectedId matching a diagram,
    // Then that diagram-item carries the diagram-item--selected modifier
    it('applies diagram-item--selected to the matching selectedId in compact mode', async () => {
      const { diagrams: apiDiagrams } = await import('@/api')

      vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
        makeDiagram(10, 'Selected diagram', new Date('2026-01-01')),
        makeDiagram(11, 'Other diagram', new Date('2026-01-02')),
      ] as never[])

      const { wrapper } = await mountList({ selectedId: 10, compact: true })

      const items = wrapper.findAll('.diagram-item')
      const selectedItems = items.filter((el) => el.classes('diagram-item--selected'))
      expect(selectedItems).toHaveLength(1)
      expect(selectedItems[0].find('.diagram-item__title').text()).toBe('Selected diagram')

      // Non-selected item must not carry the modifier
      const otherItem = items.find((el) => !el.classes('diagram-item--selected'))
      expect(otherItem).toBeDefined()
      expect(otherItem!.find('.diagram-item__title').text()).toBe('Other diagram')
    })

    // BDD: Given compact=true, When a tile is clicked,
    // Then the select event is emitted with the diagram id
    it('emits select with the diagram id when a compact tile is clicked', async () => {
      const { diagrams: apiDiagrams } = await import('@/api')

      vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
        makeDiagram(55, 'Clickable', new Date('2026-01-01')),
      ] as never[])

      const { wrapper } = await mountList({ selectedId: null, compact: true })

      await wrapper.find('.diagram-item__open').trigger('click')

      expect(wrapper.emitted('select')).toHaveLength(1)
      expect(wrapper.emitted('select')![0]).toEqual([55])
    })

    // BDD: Given compact=true, When the delete button is clicked,
    // Then deleted is emitted with the diagram id
    it('emits deleted with the diagram id when the compact delete button is clicked', async () => {
      const { diagrams: apiDiagrams } = await import('@/api')

      vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
        makeDiagram(77, 'To delete', new Date('2026-01-01')),
      ] as never[])

      const { wrapper } = await mountList({ selectedId: null, compact: true })

      await wrapper.find('.diagram-item__del').trigger('click')
      await flushPromises()

      expect(apiDiagrams.deleteDiagram).toHaveBeenCalledWith(77)
      expect(wrapper.emitted('deleted')).toHaveLength(1)
      expect(wrapper.emitted('deleted')![0]).toEqual([77])
    })

    // BDD: Given compact=false (default), diagram-card grid is still rendered
    it('still renders the card grid when compact is false (default)', async () => {
      const { diagrams: apiDiagrams } = await import('@/api')

      vi.mocked(apiDiagrams.listDiagrams).mockResolvedValueOnce([
        makeDiagram(3, 'Card diagram', new Date('2026-01-01')),
      ] as never[])

      const { wrapper } = await mountList({ selectedId: null, compact: false })

      expect(wrapper.find('.diagram-grid').exists()).toBe(true)
      expect(wrapper.find('.diagram-card').exists()).toBe(true)
      expect(wrapper.find('.diagram-item').exists()).toBe(false)
    })
  })
})
