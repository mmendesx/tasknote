import { http } from './client'
import type { SearchResponse } from '@tasknote/shared'

export function search(q: string): Promise<SearchResponse> {
  return http<SearchResponse>(`/search?q=${encodeURIComponent(q)}`)
}
