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
})
