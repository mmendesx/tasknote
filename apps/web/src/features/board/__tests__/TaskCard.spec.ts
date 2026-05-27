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
    priority: 'medium',
    due_date: null,
    position: 0,
    archived_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
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

  it('SCN-3: renders .task-card__tags with role=group and correct aria-label when tags exist', async () => {
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

    // Hydrate the tags store
    const storeState = pinia.state.value['tags']
    if (storeState) {
      storeState.list = tagsList
    }
    await wrapper.vm.$nextTick()

    const tagsEl = wrapper.find('.task-card__tags')
    expect(tagsEl.exists()).toBe(true)
    expect(tagsEl.attributes('role')).toBe('group')
    expect(tagsEl.attributes('aria-label')).toBe('Tags: urgent, frontend')
  })

  it('SCN-3: tag dot spans have aria-hidden="true"', async () => {
    const tagsList = [{ id: 1, name: 'urgent', color: '#f00' }]
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(TaskCard, {
      global: { plugins: [pinia] },
      props: {
        task: makeTask({ tag_ids: [1] }),
        tagColors: { 1: '#f00' },
      },
    })

    const storeState = pinia.state.value['tags']
    if (storeState) {
      storeState.list = tagsList
    }
    await wrapper.vm.$nextTick()

    const dots = wrapper.findAll('.tag-dot')
    expect(dots.length).toBeGreaterThan(0)
    dots.forEach((dot) => {
      expect(dot.attributes('aria-hidden')).toBe('true')
    })
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
