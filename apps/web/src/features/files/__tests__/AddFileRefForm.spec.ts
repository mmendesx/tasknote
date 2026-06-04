/**
 * Regression — Browse button removed.
 *
 * Bug: clicking "Browse" put the file *name* into the path field, never the
 * absolute path. Browsers do not expose a file's absolute path through any API
 * (File.path is non-standard / undefined, File System Access returns an opaque
 * handle), so the Browse affordance could never fill the field correctly and
 * its fallback (file.name) failed the form's own ABSOLUTE_PATH_PATTERN check.
 *
 * Fix: remove the Browse button + hidden <input type="file">. Path is entered
 * manually. This test locks that the misleading affordance stays gone and that
 * manual path entry still works.
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AddFileRefForm from '../AddFileRefForm.vue'

describe('AddFileRefForm', () => {
  it('renders no file-picker affordance (Browse removed)', () => {
    const wrapper = mount(AddFileRefForm, { props: { taskId: 1 } })

    // No hidden native file input
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)

    // No "Browse" control
    const browse = wrapper
      .findAll('button')
      .find((b) => /browse/i.test(b.text()))
    expect(browse).toBeUndefined()
  })

  it('accepts a manually-typed absolute path', async () => {
    const wrapper = mount(AddFileRefForm, { props: { taskId: 1 } })

    const pathInput = wrapper.find('input')
    await pathInput.setValue('/Users/me/docs/spec.pdf')

    expect((pathInput.element as HTMLInputElement).value).toBe(
      '/Users/me/docs/spec.pdf',
    )
  })
})
