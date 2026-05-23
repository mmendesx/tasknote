import { http } from './client'
import type { Settings } from '@tasknote/shared'
import type { UpdateSettingsDto, OnboardDto } from '@tasknote/shared'

export function getSettings(): Promise<Settings> {
  return http<Settings>('/settings')
}

export function patchSettings(dto: UpdateSettingsDto): Promise<Settings> {
  return http<Settings>('/settings', { method: 'PATCH', body: dto })
}

export function onboard(dto: OnboardDto): Promise<Settings> {
  return http<Settings>('/settings/onboard', { method: 'POST', body: dto })
}
