import { http } from './client'
import type { Note } from '@tasknote/shared'
import type { CreateNoteDto, UpdateNoteDto } from '@tasknote/shared'

export function listNotes(taskId?: number): Promise<Note[]> {
  const query = taskId !== undefined ? `?task_id=${taskId}` : ''
  return http<Note[]>(`/notes${query}`)
}

export function getNote(id: number): Promise<Note> {
  return http<Note>(`/notes/${id}`)
}

export function createNote(dto: CreateNoteDto): Promise<Note> {
  return http<Note>('/notes', { method: 'POST', body: dto })
}

export function updateNote(id: number, dto: UpdateNoteDto): Promise<Note> {
  return http<Note>(`/notes/${id}`, { method: 'PATCH', body: dto })
}

export function deleteNote(id: number): Promise<void> {
  return http<void>(`/notes/${id}`, { method: 'DELETE' })
}

export function restoreNote(id: number): Promise<Note> {
  return http<Note>(`/notes/${id}/restore`, { method: 'POST' })
}

export function permanentDeleteNote(id: number): Promise<void> {
  return http<void>(`/notes/${id}/permanent`, { method: 'DELETE' })
}

export function listArchivedNotes(): Promise<Note[]> {
  return http<Note[]>('/notes/archived')
}
