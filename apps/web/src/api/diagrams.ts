import { http } from './client'
import type { Diagram } from '@tasknote/shared'
import type { CreateDiagramDto, UpdateDiagramDto } from '@tasknote/shared'

export function listDiagrams(): Promise<Diagram[]> {
  return http<Diagram[]>('/diagrams')
}

export function getDiagram(id: number): Promise<Diagram> {
  return http<Diagram>(`/diagrams/${id}`)
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
