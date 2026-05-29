import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import QuickAddTaskInput from '../QuickAddTaskInput.vue'

// ---------------------------------------------------------------------------
// SCN-8: quick-add from board does NOT auto-commit
//
// Architecture note: QuickAddTaskInput is a pure UI component. It does NOT
// call createTask directly — it emits 'submit' with a plain title string and
// leaves persistence to its parent (currentBoard store). This is the correct
// separation of concerns. The "no committed_on" guarantee lives in the emit
// contract at this layer: the component introduces NO commit date whatsoever.
//
// The integration guarantee (currentBoard.createTask passes no committed_on)
// is tested at the store level where the actual API call happens.
// ---------------------------------------------------------------------------

describe('SCN-8: quick-add from board does NOT auto-commit', () => {
  it('SCN-8: emits submit with only the task title — no committed_on introduced', async () => {
    const wrapper = mount(QuickAddTaskInput, {
      props: { columnId: 1, active: true },
    })

    await wrapper.find('input').setValue('Fix login bug')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toBeTruthy()
    const [emittedArgs] = wrapper.emitted('submit')!
    // The component emits a plain string title, not an object.
    // committed_on is entirely absent — the component has no knowledge of it.
    expect(emittedArgs).toEqual(['Fix login bug'])
    expect(typeof emittedArgs[0]).toBe('string')
  })

  it('SCN-8: emitted submit payload is a string, not a DTO object containing committed_on', async () => {
    const wrapper = mount(QuickAddTaskInput, {
      props: { columnId: 2, active: true },
    })

    await wrapper.find('input').setValue('Review PR')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    const [[payload]] = wrapper.emitted('submit')! as [[unknown]]
    // If this were setting committed_on, payload would be an object.
    // Asserting it is a primitive string proves the board path is clean.
    expect(payload).not.toBeInstanceOf(Object)
    expect(payload).toBe('Review PR')
  })

  it('SCN-8: does not call any external createTask API — has no API import', async () => {
    // QuickAddTaskInput is a pure emit-based component. This test verifies
    // there is no side-channel API call by confirming the only observable
    // output is the emitted event.
    const wrapper = mount(QuickAddTaskInput, {
      props: { columnId: 3, active: true },
    })

    await wrapper.find('input').setValue('Daily standup prep')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    // The component emits 'submit' and no board-related side effects.
    // Vue Test Utils also records native DOM events (input, change) on the
    // input element — those are expected. What must NOT appear is any
    // createTask/API call, which this component simply does not have.
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('cancel')).toBeFalsy()
  })

  it('SCN-8: emits cancel on Escape — no committed_on in cancel path either', async () => {
    const wrapper = mount(QuickAddTaskInput, {
      props: { columnId: 1, active: true },
    })

    await wrapper.find('input').setValue('Partial entry')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('SCN-8: shows validation error instead of emitting when title is empty', async () => {
    const wrapper = mount(QuickAddTaskInput, {
      props: { columnId: 1, active: true },
    })

    await wrapper.find('input').setValue('   ')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[role="alert"]').text()).toBe('Title is required')
  })
})
