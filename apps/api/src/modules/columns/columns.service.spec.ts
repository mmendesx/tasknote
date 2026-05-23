import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ColumnsService } from './columns.service';
import type { ColumnEntity } from './entities/column.entity';
import type { BoardEntity } from '../boards/entities/board.entity';
import type { Repository, DataSource, EntityManager } from 'typeorm';

// Helpers to build minimal entity shapes
function makeColumn(overrides: Partial<ColumnEntity> = {}): ColumnEntity {
  return {
    id: 1,
    boardId: 10,
    name: 'Backlog',
    color: '#5B616B',
    wipLimit: null,
    isDone: false,
    position: 0,
    board: {} as BoardEntity,
    tasks: [],
    ...overrides,
  } as ColumnEntity;
}


type MockColumnRepo = {
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  createQueryBuilder: ReturnType<typeof vi.fn>;
  exist: ReturnType<typeof vi.fn>;
};

type MockBoardRepo = {
  findOne: ReturnType<typeof vi.fn>;
  exist: ReturnType<typeof vi.fn>;
};

type MockDataSource = {
  transaction: ReturnType<typeof vi.fn>;
};

// Build a mock repository with vi.fn() for each method we call
function makeMockColumnRepo(): MockColumnRepo {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    createQueryBuilder: vi.fn(),
    exist: vi.fn(),
  };
}

function makeMockBoardRepo(): MockBoardRepo {
  return {
    findOne: vi.fn(),
    exist: vi.fn(),
  };
}

function makeMockDataSource(
  transactionImpl?: (cb: (manager: EntityManager) => Promise<unknown>) => Promise<unknown>,
): MockDataSource {
  return {
    transaction: vi.fn(transactionImpl ?? ((cb: (manager: EntityManager) => Promise<unknown>) => cb({} as EntityManager))),
  };
}

// ─── reorderColumns ───────────────────────────────────────────────────────────

describe('ColumnsService.reorderColumns', () => {
  let service: ColumnsService;
  let columnRepo: ReturnType<typeof makeMockColumnRepo>;
  let boardRepo: ReturnType<typeof makeMockBoardRepo>;
  let dataSource: ReturnType<typeof makeMockDataSource>;

  const boardId = 10;

  const columns = [
    makeColumn({ id: 1, boardId, position: 0, name: 'Backlog' }),
    makeColumn({ id: 2, boardId, position: 1, name: 'Doing' }),
    makeColumn({ id: 3, boardId, position: 2, name: 'Blocked' }),
    makeColumn({ id: 4, boardId, position: 3, name: 'Done' }),
  ];

  beforeEach(() => {
    columnRepo = makeMockColumnRepo();
    boardRepo = makeMockBoardRepo();

    // The transaction callback receives a manager that proxies save back to a spy.
    // manager.save(ColumnEntity, col) → second argument is the entity instance to return.
    const managerSaveSpy = vi.fn((_entityClass: unknown, col: ColumnEntity) => Promise.resolve(col));
    dataSource = makeMockDataSource((cb) =>
      cb({ save: managerSaveSpy } as unknown as EntityManager),
    );

    service = new ColumnsService(
      columnRepo as unknown as Repository<ColumnEntity>,
      boardRepo as unknown as Repository<BoardEntity>,
      dataSource as unknown as DataSource,
    );
  });

  it('updates positions in array order (0-indexed)', async () => {
    columnRepo.find.mockResolvedValue([...columns]);

    // Dragging Done (id=4) before Blocked (id=3) → [1,2,4,3]
    const reorderedIds = [1, 2, 4, 3];
    const result = await service.reorderColumns({ board_id: boardId, column_ids: reorderedIds });

    // Result order should match input ids, with position = array index
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe(1);
    expect(result[0].position).toBe(0);
    expect(result[1].id).toBe(2);
    expect(result[1].position).toBe(1);
    expect(result[2].id).toBe(4);
    expect(result[2].position).toBe(2);
    expect(result[3].id).toBe(3);
    expect(result[3].position).toBe(3);
  });

  it('throws INVALID_REORDER when column_ids length does not match board column count', async () => {
    columnRepo.find.mockResolvedValue([...columns]); // board has 4 columns

    // Sending only 3 ids — missing one
    await expect(
      service.reorderColumns({ board_id: boardId, column_ids: [1, 2, 3] }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response['code']).toBe('INVALID_REORDER');
      return true;
    });
  });

  it('throws INVALID_REORDER when column_ids contains an id not belonging to the board', async () => {
    columnRepo.find.mockResolvedValue([...columns]);

    // id=99 does not belong to board 10
    await expect(
      service.reorderColumns({ board_id: boardId, column_ids: [1, 2, 3, 99] }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response['code']).toBe('INVALID_REORDER');
      return true;
    });
  });

  it('throws INVALID_REORDER when column_ids contains duplicates', async () => {
    columnRepo.find.mockResolvedValue([...columns]);

    // Duplicate id=1 — length matches but set size does not
    await expect(
      service.reorderColumns({ board_id: boardId, column_ids: [1, 1, 2, 3] }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response['code']).toBe('INVALID_REORDER');
      return true;
    });
  });
});

// ─── updateColumn (WIP limit persistence) ────────────────────────────────────

describe('ColumnsService.updateColumn — WIP limit', () => {
  let service: ColumnsService;
  let columnRepo: ReturnType<typeof makeMockColumnRepo>;
  let boardRepo: ReturnType<typeof makeMockBoardRepo>;
  let dataSource: ReturnType<typeof makeMockDataSource>;

  beforeEach(() => {
    columnRepo = makeMockColumnRepo();
    boardRepo = makeMockBoardRepo();
    dataSource = makeMockDataSource();
    service = new ColumnsService(
      columnRepo as unknown as Repository<ColumnEntity>,
      boardRepo as unknown as Repository<BoardEntity>,
      dataSource as unknown as DataSource,
    );
  });

  it('persists wip_limit value when updated', async () => {
    const existingColumn = makeColumn({ id: 5, wipLimit: null });
    columnRepo.findOne.mockResolvedValue(existingColumn);
    columnRepo.save.mockImplementation((col) => Promise.resolve(col as ColumnEntity));

    const result = await service.updateColumn(5, { wip_limit: 3 });

    expect(result.wipLimit).toBe(3);
    expect(columnRepo.save).toHaveBeenCalledOnce();
  });

  it('persists wip_limit as null when explicitly cleared', async () => {
    const existingColumn = makeColumn({ id: 5, wipLimit: 2 });
    columnRepo.findOne.mockResolvedValue(existingColumn);
    columnRepo.save.mockImplementation((col) => Promise.resolve(col as ColumnEntity));

    const result = await service.updateColumn(5, { wip_limit: null });

    expect(result.wipLimit).toBeNull();
  });

  it('throws NotFoundException when column does not exist', async () => {
    columnRepo.findOne.mockResolvedValue(null);

    await expect(service.updateColumn(999, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
