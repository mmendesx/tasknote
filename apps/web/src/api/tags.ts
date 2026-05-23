import { http } from './client'
import type { Tag, Task } from '@tasknote/shared'
import type { CreateTagDto, UpdateTagDto } from '@tasknote/shared'

export function listTags(): Promise<Tag[]> {
  return http<Tag[]>('/tags')
}

export function createTag(dto: CreateTagDto): Promise<Tag> {
  return http<Tag>('/tags', { method: 'POST', body: dto })
}

export function updateTag(id: number, dto: UpdateTagDto): Promise<Tag> {
  return http<Tag>(`/tags/${id}`, { method: 'PATCH', body: dto })
}

export function deleteTag(id: number): Promise<void> {
  return http<void>(`/tags/${id}`, { method: 'DELETE' })
}

export function addTagToTask(taskId: number, tagId: number): Promise<Task> {
  return http<Task>(`/tasks/${taskId}/tags`, { method: 'POST', body: { tag_id: tagId } })
}

export function removeTagFromTask(taskId: number, tagId: number): Promise<void> {
  return http<void>(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' })
}
