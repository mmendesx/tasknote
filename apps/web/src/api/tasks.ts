import { http } from './client'
import type { Task } from '@tasknote/shared'
import type { CreateTaskDto, UpdateTaskDto, MoveTaskDto } from '@tasknote/shared'

export function getTask(id: number): Promise<Task> {
  return http<Task>(`/tasks/${id}`)
}

export function createTask(dto: CreateTaskDto): Promise<Task> {
  return http<Task>('/tasks', { method: 'POST', body: dto })
}

export function updateTask(id: number, dto: UpdateTaskDto): Promise<Task> {
  return http<Task>(`/tasks/${id}`, { method: 'PATCH', body: dto })
}

export function deleteTask(id: number): Promise<void> {
  return http<void>(`/tasks/${id}`, { method: 'DELETE' })
}

export function restoreTask(id: number): Promise<Task> {
  return http<Task>(`/tasks/${id}/restore`, { method: 'POST' })
}

export function moveTask(dto: MoveTaskDto): Promise<Task> {
  return http<Task>('/tasks/move', { method: 'POST', body: dto })
}

export function permanentDeleteTask(id: number): Promise<void> {
  return http<void>(`/tasks/${id}/permanent`, { method: 'DELETE' })
}
