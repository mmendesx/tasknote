import { http } from './client'
import type { Diagram } from '@tasknote/shared'
import type { CreateDiagramDto, UpdateDiagramDto } from '@tasknote/shared'

export function listDiagrams(signal?: AbortSignal): Promise<Diagram[]> {
  return http<Diagram[]>('/diagrams', { signal })
}

export function getDiagram(id: number, signal?: AbortSignal): Promise<Diagram> {
  return http<Diagram>(`/diagrams/${id}`, { signal })
}

export function createDiagram(dto: CreateDiagramDto): Promise<Diagram> {
  return http<Diagram>('/diagrams', { method: 'POST', body: dto })
}

export function updateDiagram(id: number, dto: UpdateDiagramDto): Promise<Diagram> {
  return http<Diagram>(`/diagrams/${id}`, { method: 'PATCH', body: dto })
}

export function deleteDiagram(id: number): Promise<void> {
  return http<void>(`/diagrams/${id}`, { method: 'DELETE' })
}
