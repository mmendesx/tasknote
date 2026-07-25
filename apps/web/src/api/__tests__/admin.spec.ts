import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as adminApi from '@/api/admin'

describe('adminApi.reset', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ reset: true }), { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the typed confirmation word so the server guard passes', async () => {
    await adminApi.reset('RESET')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(init?.body as string)).toEqual({ confirm: 'RESET' })
  })
})
