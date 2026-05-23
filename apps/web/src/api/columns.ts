import { http } from './client'
import type { Column } from '@tasknote/shared'
import type { CreateColumnDto, UpdateColumnDto, ReorderColumnsDto } from '@tasknote/shared'

export function createColumn(dto: CreateColumnDto): Promise<Column> {
  return http<Column>('/columns', { method: 'POST', body: dto })
}

export function updateColumn(id: number, dto: UpdateColumnDto): Promise<Column> {
  return http<Column>(`/columns/${id}`, { method: 'PATCH', body: dto })
}

export function deleteColumn(id: number): Promise<void> {
  return http<void>(`/columns/${id}`, { method: 'DELETE' })
}

export function reorderColumns(dto: ReorderColumnsDto): Promise<void> {
  return http<void>('/columns/reorder', { method: 'POST', body: dto })
}
