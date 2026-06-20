import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskCard from '../TaskCard.vue'

// --- Module mocks ---

vi.mock('@/composables/useIsDesktop', () => ({
  useIsDesktop: () => ({ value: true }),
}))

vi.mock('@/composables/useAnime', () => ({
  useAnime: () => ({
    animate: vi.fn(),
    prefersReducedMotion: { value: false },
  }),
}))

vi.mock('@/stores/currentBoard', () => ({
  useCurrentBoardStore: () => ({
    board: { columns: [] },
    moveTask: vi.fn(),
  }),
}))

vi.mock('@tasknote/ui', () => ({
  DropdownMenu: {
    name: 'DropdownMenu',
    template: '<div><slot name="trigger" /></div>',
    props: ['items', 'side', 'align'],
  },
}))

// --- Helpers ---

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    column_id: 1,
    title: 'Test task',
    description_md: null,
    priority: 'medium' as const,
    due_date: null,
    position: 0,
    archived_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tag_ids: [],
    ...overrides,
  }
}

function mountCard(taskOverrides: Record<string, unknown> = {}, tagsList: { id: number; name: string }[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)

  // Populate the tags store so tagNames resolves correctly
  const tagsStore = pinia.state.value
  // We patch useTagsStore via the store state after mount:
  // mount first, then we set the list on the store instance.
  const wrapper = mount(TaskCard, {
    global: { plugins: [pinia] },
    props: { task: makeTask(taskOverrides) },
  })

  // Hydrate the tags store list so the computed resolves tag names
  if (tagsList.length > 0) {
    const store = wrapper.vm.$.appContext.app.config.globalProperties.$pinia
      ?.state.value?.tags
    if (store) {
      store.list = tagsList
    }
  }

  return wrapper
}

// --- ICT-49: formatDueDate ---

describe('ICT-49 — formatDueDate: robust due_date parsing', () => {
  // We test the function indirectly via the rendered output.
  // A future-dated due_date (far in the future) will render the formatted date string.

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('SCN-1: raw YYYY-MM-DD string renders the correct date without day-flip', () => {
    // Use a far-future date to avoid "Overdue" / "Today" / "Tomorrow" branches
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: { task: makeTask({ due_date: '2099-06-15' }) },
    })

    const dueEl = wrapper.find('.task-card__due')
    expect(dueEl.exists()).toBe(true)
    expect(dueEl.text()).toBe('Jun 15')
  })

  it('SCN-2: full ISO string renders the correct date without day-flip', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: { task: makeTask({ due_date: '2099-06-15T12:00:00.000Z' }) },
    })

    const dueEl = wrapper.find('.task-card__due')
    expect(dueEl.exists()).toBe(true)
    expect(dueEl.text()).toBe('Jun 15')
  })

  it('does not render due date element when due_date is null', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: { task: makeTask({ due_date: null }) },
    })

    expect(wrapper.find('.task-card__due').exists()).toBe(false)
  })
})

// --- ICT-66: Committed marker ---

describe('ICT-66 — TaskCard committed marker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows today marker when committed_on matches today prop', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: {
        task: makeTask({ committed_on: '2026-05-28' }),
        today: '2026-05-28',
      },
    })

    const marker = wrapper.find('.task-card__committed--today')
    expect(marker.exists()).toBe(true)
    expect(marker.attributes('aria-label')).toBe('Committed today')
  })

  it('shows earlier marker when committed_on is before today and task is open', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: {
        task: makeTask({ committed_on: '2026-05-20', completed_at: null, archived_at: null }),
        today: '2026-05-28',
      },
    })

    const marker = wrapper.find('.task-card__committed--earlier')
    expect(marker.exists()).toBe(true)
    expect(marker.attributes('aria-label')).toBe('Committed earlier')
  })

  it('shows no marker when committed_on is null', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: {
        task: makeTask({ committed_on: null }),
        today: '2026-05-28',
      },
    })

    expect(wrapper.find('.task-card__committed--today').exists()).toBe(false)
    expect(wrapper.find('.task-card__committed--earlier').exists()).toBe(false)
  })

  it('shows no marker when today prop is not provided', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: {
        task: makeTask({ committed_on: '2026-05-28' }),
        // today prop omitted
      },
    })

    expect(wrapper.find('.task-card__committed--today').exists()).toBe(false)
    expect(wrapper.find('.task-card__committed--earlier').exists()).toBe(false)
  })

  it('shows no earlier marker when task is completed', () => {
    const wrapper = mount(TaskCard, {
      global: { plugins: [createPinia()] },
      props: {
        task: makeTask({ committed_on: '2026-05-20', completed_at: new Date() }),
        today: '2026-05-28',
      },
    })

    expect(wrapper.find('.task-card__committed--earlier').exists()).toBe(false)
  })
})

// --- ICT-50: Tags container role=group ---

describe('ICT-50 — tags container role=group', () => {
  function mountWithTags(tagIds: number[], tagsList: { id: number; name: string; color: string }[]) {
    const pinia = createPinia()
    setActivePinia(pinia)

    const tagColors: Record<number, string> = {}
    tagsList.forEach((t) => { tagColors[t.id] = t.color })

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: {
        task: makeTask({ tag_ids: tagIds }),
        tagColors,
      },
    })

    // Hydrate the tags store so tagNames computed resolves names
    const storeState = pinia.state.value['tags']
    if (storeState) {
      storeState.list = tagsList
    }

    return wrapper
  }

  it('renders the tag NAME as visible text for each tag (not a colored dot)', async () => {
    const tagsList = [
      { id: 1, name: 'urgent', color: '#f00' },
      { id: 2, name: 'frontend', color: '#00f' },
    ]
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: {
        task: makeTask({ tag_ids: [1, 2] }),
        tagColors: { 1: '#f00', 2: '#00f' },
      },
    })

    const storeState = pinia.state.value['tags']
    if (storeState) {
      storeState.list = tagsList
    }
    await wrapper.vm.$nextTick()

    // Old colored dots are gone.
    expect(wrapper.find('.tag-dot').exists()).toBe(false)

    const chips = wrapper.findAll('.task-card__tag')
    expect(chips).toHaveLength(2)
    expect(chips[0].text()).toBe('urgent')
    expect(chips[1].text()).toBe('frontend')
  })

  it('caps visible chips at 2 and shows a +N overflow chip with the overflow names', async () => {
    const tagsList = [
      { id: 1, name: 'urgent', color: '#f00' },
      { id: 2, name: 'frontend', color: '#00f' },
      { id: 3, name: 'backend', color: '#0f0' },
      { id: 4, name: 'design', color: '#ff0' },
    ]
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: {
        task: makeTask({ tag_ids: [1, 2, 3, 4] }),
        tagColors: { 1: '#f00', 2: '#00f', 3: '#0f0', 4: '#ff0' },
      },
    })

    const storeState = pinia.state.value['tags']
    if (storeState) {
      storeState.list = tagsList
    }
    await wrapper.vm.$nextTick()

    const named = wrapper.findAll('.task-card__tag:not(.task-card__tag--overflow)')
    expect(named).toHaveLength(2)
    expect(named.map((c) => c.text())).toEqual(['urgent', 'frontend'])

    const overflow = wrapper.find('.task-card__tag--overflow')
    expect(overflow.exists()).toBe(true)
    expect(overflow.text()).toBe('+2')
    // Overflow names are exposed for screen readers since they aren't shown.
    expect(overflow.attributes('aria-label')).toContain('backend')
    expect(overflow.attributes('aria-label')).toContain('design')
  })

  it('SCN-4: does not render tags container when tag_ids is empty', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: { task: makeTask({ tag_ids: [] }) },
    })

    await wrapper.vm.$nextTick()

    const tagsEl = wrapper.find('.task-card__tags')
    expect(tagsEl.exists()).toBe(false)

    // No element with role=group for tags should be present
    const groupEl = wrapper.find('[role="group"]')
    expect(groupEl.exists()).toBe(false)
  })

  it('SCN-4: does not render tags container when tag_ids is undefined', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const task = makeTask()
    delete (task as Record<string, unknown>).tag_ids

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: { task },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.find('.task-card__tags').exists()).toBe(false)
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
  })
})
