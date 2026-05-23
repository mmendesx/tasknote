import { http } from './client'
import type { FileRef, TargetType } from '@tasknote/shared'
import type { CreateFileRefDto, UpdateFileRefDto } from '@tasknote/shared'

export function listFileRefs(target_type: TargetType, target_id: number): Promise<FileRef[]> {
  return http<FileRef[]>(`/file-refs?target_type=${target_type}&target_id=${target_id}`)
}

export function createFileRef(dto: CreateFileRefDto): Promise<FileRef> {
  return http<FileRef>('/file-refs', { method: 'POST', body: dto })
}

/**
 * NOTE: PATCH /api/file-refs/:id is not listed in spec-1-tasknote-mvp.md but
 * is specified in ICT-16 task list. Implemented here; API team must add endpoint.
 */
export function updateFileRef(id: number, dto: UpdateFileRefDto): Promise<FileRef> {
  return http<FileRef>(`/file-refs/${id}`, { method: 'PATCH', body: dto })
}

export function deleteFileRef(id: number): Promise<void> {
  return http<void>(`/file-refs/${id}`, { method: 'DELETE' })
}

export function checkExists(id: number): Promise<{ exists: boolean }> {
  return http<{ exists: boolean }>(`/file-refs/${id}/exists`)
}

export function openFile(id: number): Promise<void> {
  return http<void>(`/file-refs/${id}/open`, { method: 'POST' })
}
