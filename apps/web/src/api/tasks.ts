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

export function listArchivedTasks(boardId?: number): Promise<Task[]> {
  const query = boardId !== undefined ? `?board_id=${boardId}` : ''
  return http<Task[]>(`/tasks/archived${query}`)
}

export type TodayTask = Task & { carried_days: number }

export function listToday(today: string): Promise<TodayTask[]> {
  return http<TodayTask[]>(`/tasks/today?today=${today}`)
}

export function commitTask(id: number, today: string): Promise<Task> {
  return http<Task>(`/tasks/${id}/commit`, { method: 'POST', body: { today } })
}

export function uncommitTask(id: number): Promise<Task> {
  return http<Task>(`/tasks/${id}/commit`, { method: 'DELETE' })
}
