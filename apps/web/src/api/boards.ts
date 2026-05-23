import { http } from './client'
import type { Board, BoardWithColumns } from '@tasknote/shared'
import type { CreateBoardDto, UpdateBoardDto } from '@tasknote/shared'

export function listBoards(): Promise<Board[]> {
  return http<Board[]>('/boards')
}

export function getBoard(id: number): Promise<BoardWithColumns> {
  return http<BoardWithColumns>(`/boards/${id}`)
}

export function createBoard(dto: CreateBoardDto): Promise<Board> {
  return http<Board>('/boards', { method: 'POST', body: dto })
}

export function updateBoard(id: number, dto: UpdateBoardDto): Promise<Board> {
  return http<Board>(`/boards/${id}`, { method: 'PATCH', body: dto })
}

export function deleteBoard(id: number): Promise<void> {
  return http<void>(`/boards/${id}`, { method: 'DELETE' })
}
