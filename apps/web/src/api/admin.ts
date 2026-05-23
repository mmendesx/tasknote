import { http } from './client'

export function exportData(): Promise<unknown> {
  return http<unknown>('/export')
}

export function importData(payload: unknown): Promise<void> {
  return http<void>('/import', { method: 'POST', body: payload })
}

export function reset(): Promise<void> {
  return http<void>('/reset', { method: 'POST' })
}
