import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskLinkPicker from '../TaskLinkPicker.vue'

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
}))

vi.mock('@tasknote/ui', () => ({
  Input: {
    name: 'Input',
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" v-bind="$attrs" />',
    props: ['modelValue', 'placeholder', 'size', 'autofocus'],
    emits: ['update:modelValue'],
  },
}))

vi.mock('@/stores/currentBoard', () => ({
  useCurrentBoardStore: () => ({
    board: {
      columns: [
        {
          tasks: [
            { id: 1, title: 'Alpha task', column_id: 1, priority: 'medium', position: 0, description_md: null, due_date: null, archived_at: null, completed_at: null, created_at: '', updated_at: '', tag_ids: [] },
            { id: 2, title: 'Beta task', column_id: 1, priority: 'medium', position: 1, description_md: null, due_date: null, archived_at: null, completed_at: null, created_at: '', updated_at: '', tag_ids: [] },
            { id: 3, title: 'Gamma task', column_id: 1, priority: 'medium', position: 2, description_md: null, due_date: null, archived_at: null, completed_at: null, created_at: '', updated_at: '', tag_ids: [] },
          ],
        },
      ],
    },
  }),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function mountPicker(linkedTaskId: number | null = null) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(TaskLinkPicker, {
    props: { linkedTaskId },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TaskLinkPicker', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // AC1 — Unlinked state: dashed chip with link icon + "Link to task…"
  describe('unlinked state', () => {
    it('renders a chip button with "Link to task…" text', () => {
      const wrapper = mountPicker(null)
      const chip = wrapper.find('.task-link-picker__chip--unlinked')
      expect(chip.exists()).toBe(true)
      expect(chip.text()).toContain('Link to task…')
    })

    it('chip has aria-haspopup="listbox" and aria-expanded="false"', () => {
      const wrapper = mountPicker(null)
      const chip = wrapper.find('.task-link-picker__chip--unlinked')
      expect(chip.attributes('aria-haspopup')).toBe('listbox')
      expect(chip.attributes('aria-expanded')).toBe('false')
    })

    it('does not render the linked chip', () => {
      const wrapper = mountPicker(null)
      expect(wrapper.find('.task-link-picker__chip--linked').exists()).toBe(false)
    })
  })

  // AC2 — Linked state: chip with task name + hover-revealed unlink button
  describe('linked state', () => {
    it('renders the linked chip with the task name', () => {
      const wrapper = mountPicker(2)
      const chip = wrapper.find('.task-link-picker__chip--linked')
      expect(chip.exists()).toBe(true)
      expect(chip.text()).toContain('Beta task')
    })

    it('renders an unlink button inside the linked chip', () => {
      const wrapper = mountPicker(1)
      const unlinkBtn = wrapper.find('.task-link-picker__unlink-btn')
      expect(unlinkBtn.exists()).toBe(true)
      expect(unlinkBtn.attributes('aria-label')).toBe('Unlink task')
    })

    it('emits select(null) when unlink button is clicked', async () => {
      const wrapper = mountPicker(1)
      await wrapper.find('.task-link-picker__unlink-btn').trigger('click')
      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')![0]).toEqual([null])
    })

    it('does not render the unlinked chip', () => {
      const wrapper = mountPicker(1)
      expect(wrapper.find('.task-link-picker__chip--unlinked').exists()).toBe(false)
    })
  })

  // AC3 — Dropdown uses .diagram-floating-chrome surface
  describe('dropdown surface', () => {
    it('dropdown has .diagram-floating-chrome class', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')
      const dropdown = wrapper.find('.task-link-picker__dropdown')
      expect(dropdown.exists()).toBe(true)
      expect(dropdown.classes()).toContain('diagram-floating-chrome')
    })

    it('dropdown has role="listbox" and aria-label="Tasks"', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')
      const listbox = wrapper.find('[role="listbox"]')
      expect(listbox.exists()).toBe(true)
      expect(listbox.attributes('aria-label')).toBe('Tasks')
    })

    it('all task options have role="option"', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')
      const options = wrapper.findAll('.task-link-picker__item')
      expect(options.length).toBe(3)
      options.forEach((o) => expect(o.attributes('role')).toBe('option'))
    })
  })

  // AC4 — ArrowDown twice + Enter on 3-item list → second task linked
  describe('keyboard navigation', () => {
    it('ArrowDown twice then Enter selects the second task', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')

      const root = wrapper.find('.task-link-picker')
      await root.trigger('keydown', { key: 'ArrowDown' })
      await root.trigger('keydown', { key: 'ArrowDown' })
      await root.trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('select')).toBeTruthy()
      // Second task has id=2
      expect(wrapper.emitted('select')![0]).toEqual([2])
    })

    it('active option has aria-selected="true"', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')

      const root = wrapper.find('.task-link-picker')
      await root.trigger('keydown', { key: 'ArrowDown' })

      const options = wrapper.findAll('.task-link-picker__item')
      expect(options[0].attributes('aria-selected')).toBe('true')
      expect(options[1].attributes('aria-selected')).toBe('false')
    })

    it('Escape closes the dropdown', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')
      expect(wrapper.find('.task-link-picker__dropdown').exists()).toBe(true)

      await wrapper.find('.task-link-picker').trigger('keydown', { key: 'Escape' })
      expect(wrapper.find('.task-link-picker__dropdown').exists()).toBe(false)
    })

    it('clicking a task emits its id', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')

      const items = wrapper.findAll('.task-link-picker__item')
      await items[2].trigger('mousedown')

      expect(wrapper.emitted('select')![0]).toEqual([3])
    })
  })

  // AC5 — Empty search → "No tasks found" message
  describe('empty state', () => {
    it('shows "No tasks found" when search matches nothing', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')

      const input = wrapper.find('input')
      await input.setValue('zzznomatch')

      expect(wrapper.find('.task-link-picker__empty').exists()).toBe(true)
      expect(wrapper.find('.task-link-picker__empty').text()).toBe('No tasks found')
    })

    it('does not show task items when empty', async () => {
      const wrapper = mountPicker(null)
      await wrapper.find('.task-link-picker__chip--unlinked').trigger('click')

      await wrapper.find('input').setValue('zzznomatch')
      expect(wrapper.findAll('.task-link-picker__item').length).toBe(0)
    })
  })
})
