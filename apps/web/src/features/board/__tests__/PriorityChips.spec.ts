import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PriorityChips from '../PriorityChips.vue'
import type { Priority } from '@tasknote/shared'

function mountChips(modelValue: Priority = 'medium', disabled = false) {
  return mount(PriorityChips, {
    props: { modelValue, disabled },
  })
}

describe('PriorityChips', () => {
  // ── Structure ────────────────────────────────────────────────────────────────

  it('renders 4 chips', () => {
    const wrapper = mountChips()
    const chips = wrapper.findAll('[role="radio"]')
    expect(chips).toHaveLength(4)
  })

  it('labels chips Low / Medium / High / Urgent in order', () => {
    const wrapper = mountChips()
    const labels = wrapper.findAll('[role="radio"]').map((c) => c.text())
    expect(labels).toEqual(['Low', 'Medium', 'High', 'Urgent'])
  })

  it('has a radiogroup container with aria-label "Priority"', () => {
    const wrapper = mountChips()
    const group = wrapper.find('[role="radiogroup"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Priority')
  })

  // ── aria-checked ─────────────────────────────────────────────────────────────

  it('marks the chip matching modelValue as aria-checked="true"', () => {
    const wrapper = mountChips('high')
    const chips = wrapper.findAll('[role="radio"]')
    expect(chips[2].attributes('aria-checked')).toBe('true')
    expect(chips[0].attributes('aria-checked')).toBe('false')
    expect(chips[1].attributes('aria-checked')).toBe('false')
    expect(chips[3].attributes('aria-checked')).toBe('false')
  })

  it('only one chip has aria-checked="true" at a time', async () => {
    const wrapper = mountChips('low')
    await wrapper.setProps({ modelValue: 'urgent' })
    const checked = wrapper
      .findAll('[role="radio"]')
      .filter((c) => c.attributes('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0].text()).toBe('Urgent')
  })

  // ── Click interaction ────────────────────────────────────────────────────────

  it('emits update:modelValue with the clicked priority', async () => {
    const wrapper = mountChips('low')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[3].trigger('click') // Urgent
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['urgent'])
  })

  it('emits the correct priority for each chip', async () => {
    const priorities: Priority[] = ['low', 'medium', 'high', 'urgent']
    for (let i = 0; i < priorities.length; i++) {
      const wrapper = mountChips('low')
      const chips = wrapper.findAll('[role="radio"]')
      await chips[i].trigger('click')
      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted![emitted!.length - 1]).toEqual([priorities[i]])
    }
  })

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  it('ArrowRight on a chip emits the next priority', async () => {
    const wrapper = mountChips('low')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['medium'])
  })

  it('ArrowLeft on a chip emits the previous priority', async () => {
    const wrapper = mountChips('high')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[2].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['medium'])
  })

  it('ArrowRight wraps from last chip to first', async () => {
    const wrapper = mountChips('urgent')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[3].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['low'])
  })

  it('ArrowLeft wraps from first chip to last', async () => {
    const wrapper = mountChips('low')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['urgent'])
  })

  it('Enter key selects the focused chip', async () => {
    const wrapper = mountChips('medium')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[1].trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['medium'])
  })

  it('Space key selects the focused chip', async () => {
    const wrapper = mountChips('low')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[0].trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['low'])
  })

  it('ArrowDown behaves like ArrowRight', async () => {
    const wrapper = mountChips('low')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[0].trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['medium'])
  })

  it('ArrowUp behaves like ArrowLeft', async () => {
    const wrapper = mountChips('high')
    const chips = wrapper.findAll('[role="radio"]')
    await chips[2].trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['medium'])
  })

  it('ArrowRight moves DOM focus to the next chip', async () => {
    const wrapper = mount(PriorityChips, {
      props: { modelValue: 'low' },
      attachTo: document.body,
    })
    const chips = wrapper.findAll('[role="radio"]')
    // Focus the first chip explicitly
    ;(chips[0].element as HTMLElement).focus()
    await chips[0].trigger('keydown', { key: 'ArrowRight' })
    // After nextTick inside moveFocus, focus should be on the second chip
    await nextTick()
    expect(document.activeElement).toBe(chips[1].element)
    wrapper.unmount()
  })

  // ── Roving tabindex ──────────────────────────────────────────────────────────

  it('active chip has tabindex 0; others have tabindex -1', () => {
    const wrapper = mountChips('medium')
    const chips = wrapper.findAll('[role="radio"]')
    expect(chips[1].attributes('tabindex')).toBe('0')
    expect(chips[0].attributes('tabindex')).toBe('-1')
    expect(chips[2].attributes('tabindex')).toBe('-1')
    expect(chips[3].attributes('tabindex')).toBe('-1')
  })

  it('tabindex shifts to new active chip after prop update', async () => {
    const wrapper = mountChips('low')
    await wrapper.setProps({ modelValue: 'urgent' })
    const chips = wrapper.findAll('[role="radio"]')
    expect(chips[3].attributes('tabindex')).toBe('0')
    expect(chips[0].attributes('tabindex')).toBe('-1')
  })

  // ── Disabled state ───────────────────────────────────────────────────────────

  it('does not emit when disabled and a chip is clicked', async () => {
    const wrapper = mountChips('low', true)
    const chips = wrapper.findAll('[role="radio"]')
    await chips[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('marks container as aria-disabled when disabled prop is true', () => {
    const wrapper = mountChips('low', true)
    const group = wrapper.find('[role="radiogroup"]')
    expect(group.attributes('aria-disabled')).toBe('true')
  })
})
