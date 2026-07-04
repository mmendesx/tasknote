import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  settings: {
    onboard: vi.fn(),
  },
  boards: {
    listBoards: vi.fn(),
  },
}))

import { useSettingsStore } from '@/stores/settings'
import { useBoardsStore } from '@/stores/boards'
import * as api from '@/api'

describe('useSettingsStore — onboard', () => {
  let settingsStore: ReturnType<typeof useSettingsStore>
  let boardsStore: ReturnType<typeof useBoardsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    settingsStore = useSettingsStore()
    boardsStore = useBoardsStore()
    vi.resetAllMocks()
  })

  it('refreshes the boards list so the seeded board appears without a page refresh', async () => {
    const seeded = { id: 1, name: 'Seeded Board', position: 0 }
    vi.mocked(api.settings.onboard).mockResolvedValue({ onboarded_at: '2026-07-04T00:00:00Z' } as never)
    vi.mocked(api.boards.listBoards).mockResolvedValue([seeded] as never)

    expect(boardsStore.list).toEqual([])
    await settingsStore.onboard({ name: 'Matheus' } as never)

    expect(api.boards.listBoards).toHaveBeenCalledTimes(1)
    expect(boardsStore.list).toHaveLength(1)
    expect(boardsStore.list[0]).toMatchObject({ id: 1, name: 'Seeded Board' })
    expect(settingsStore.isOnboarded).toBe(true)
  })

  it('does not reload boards when onboarding fails', async () => {
    vi.mocked(api.settings.onboard).mockRejectedValue(new Error('boom'))

    await expect(settingsStore.onboard({ name: 'Matheus' } as never)).rejects.toThrow('boom')

    expect(api.boards.listBoards).not.toHaveBeenCalled()
    expect(settingsStore.error).toBe('boom')
  })
})
