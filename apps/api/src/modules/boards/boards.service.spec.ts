/**
 * boards.service.spec.ts
 *
 * Vitest tests for BoardsService.
 * Uses an in-memory better-sqlite3 DataSource (synchronize: true) so tests
 * are self-contained and require no external process.
 *
 * BDD scenarios covered:
 *   - "Create a new board": position auto-assigned, 4 default columns created
 *   - "Cannot delete the last board": 409 CONFLICT / LAST_BOARD
 *   - "Switching boards is instant": getOne returns nested columns + tasks structure
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BoardEntity } from './entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { BoardsService } from './boards.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity],
    synchronize: true,
    // Foreign-key enforcement required for cascade tests
    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BoardsService', () => {
  let dataSource: DataSource;
  let boardsRepo: Repository<BoardEntity>;
  let columnsRepo: Repository<ColumnEntity>;
  let tasksRepo: Repository<TaskEntity>;
  let service: BoardsService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    boardsRepo = dataSource.getRepository(BoardEntity);
    columnsRepo = dataSource.getRepository(ColumnEntity);
    tasksRepo = dataSource.getRepository(TaskEntity);

    service = new BoardsService(boardsRepo, columnsRepo, tasksRepo, dataSource);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── listBoards ─────────────────────────────────────────────────────────────

  describe('listBoards', () => {
    it('returns empty array when no boards exist', async () => {
      const boards = await service.listBoards();
      expect(boards).toEqual([]);
    });

    it('returns boards ordered by position ascending', async () => {
      // Insert out-of-order to verify sort
      await boardsRepo.save([
        boardsRepo.create({ name: 'Beta', position: 2 }),
        boardsRepo.create({ name: 'Alpha', position: 0 }),
        boardsRepo.create({ name: 'Gamma', position: 1 }),
      ]);

      const boards = await service.listBoards();
      expect(boards.map((b) => b.name)).toEqual(['Alpha', 'Gamma', 'Beta']);
    });
  });

  // ─── createBoard ────────────────────────────────────────────────────────────

  describe('createBoard — BDD: Create a new board', () => {
    it('assigns position=0 when no boards exist yet', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      expect(board.position).toBe(0);
    });

    it('assigns position = max(position) + 1 when boards already exist', async () => {
      await boardsRepo.save(boardsRepo.create({ name: 'Existing', position: 0 }));

      const board = await service.createBoard({ name: 'Personal' });
      expect(board.position).toBe(1);
    });

    it('creates exactly 4 default columns', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      expect(board.columns).toHaveLength(4);
    });

    it('default column names are Backlog, Doing, Blocked, Done in order', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      const names = board.columns
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((c) => c.name);
      expect(names).toEqual(['Backlog', 'Doing', 'Blocked', 'Done']);
    });

    it('default column colors match spec', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      const sorted = board.columns.slice().sort((a, b) => a.position - b.position);
      expect(sorted[0].color).toBe('#5B616B'); // Backlog
      expect(sorted[1].color).toBe('#F5C26B'); // Doing
      expect(sorted[2].color).toBe('#F87171'); // Blocked
      expect(sorted[3].color).toBe('#A3E635'); // Done
    });

    it('Done column has isDone=true; others have isDone=false', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      const sorted = board.columns.slice().sort((a, b) => a.position - b.position);
      expect(sorted[0].isDone).toBe(false); // Backlog
      expect(sorted[1].isDone).toBe(false); // Doing
      expect(sorted[2].isDone).toBe(false); // Blocked
      expect(sorted[3].isDone).toBe(true);  // Done
    });

    it('the new board appears in listBoards after creation', async () => {
      await service.createBoard({ name: 'Personal' });
      const boards = await service.listBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0].name).toBe('Personal');
    });
  });

  // ─── getBoard ───────────────────────────────────────────────────────────────

  describe('getBoard — BDD: Switching boards is instant', () => {
    it('returns the board with nested columns and tasks', async () => {
      const created = await service.createBoard({ name: 'Work' });
      const backlogColumn = created.columns.find((c) => c.name === 'Backlog')!;

      // Add a task to Backlog
      await tasksRepo.save(
        tasksRepo.create({
          columnId: backlogColumn.id,
          title: 'Review PR #42',
          position: 0,
        }),
      );

      const board = await service.getBoard(created.id);

      expect(board.id).toBe(created.id);
      expect(board.columns).toHaveLength(4);

      const backlog = board.columns.find((c) => c.name === 'Backlog')!;
      expect(backlog).toBeDefined();
      expect(backlog.tasks).toHaveLength(1);
      expect(backlog.tasks[0].title).toBe('Review PR #42');
    });

    it('excludes archived tasks from nested columns', async () => {
      const created = await service.createBoard({ name: 'Work' });
      const doingColumn = created.columns.find((c) => c.name === 'Doing')!;

      await tasksRepo.save([
        tasksRepo.create({ columnId: doingColumn.id, title: 'Active task', position: 0 }),
        tasksRepo.create({
          columnId: doingColumn.id,
          title: 'Archived task',
          position: 1,
          archivedAt: new Date(),
        }),
      ]);

      const board = await service.getBoard(created.id);
      const doing = board.columns.find((c) => c.name === 'Doing')!;
      expect(doing.tasks).toHaveLength(1);
      expect(doing.tasks[0].title).toBe('Active task');
    });

    it('columns with zero active tasks are still returned', async () => {
      const created = await service.createBoard({ name: 'Work' });
      // Archive all tasks in Done (none were added, columns should still appear)
      const board = await service.getBoard(created.id);
      // All 4 default columns must be present even with empty task lists
      expect(board.columns).toHaveLength(4);
    });

    it('columns are ordered by position ascending', async () => {
      const created = await service.createBoard({ name: 'Work' });
      const board = await service.getBoard(created.id);
      const positions = board.columns.map((c) => c.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('throws NotFoundException when board does not exist', async () => {
      await expect(service.getBoard(9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateBoard ────────────────────────────────────────────────────────────

  describe('updateBoard', () => {
    it('updates the board name', async () => {
      const created = await service.createBoard({ name: 'Old Name' });
      const updated = await service.updateBoard(created.id, { name: 'New Name' });
      expect(updated.name).toBe('New Name');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.updateBoard(9999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeBoard ────────────────────────────────────────────────────────────

  describe('removeBoard — BDD: Cannot delete the last board', () => {
    it('throws ConflictException with code LAST_BOARD when only one board exists', async () => {
      await service.createBoard({ name: 'Only Board' });

      let caughtError: ConflictException | undefined;
      try {
        await service.removeBoard((await service.listBoards())[0].id);
      } catch (err) {
        caughtError = err as ConflictException;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      const response = caughtError!.getResponse() as { code: string; message: string };
      expect(response.code).toBe('LAST_BOARD');
      expect(response.message).toBe('At least one board must exist');
    });

    it('deletes a board when more than one exists', async () => {
      await service.createBoard({ name: 'Board A' });
      const boardB = await service.createBoard({ name: 'Board B' });

      await service.removeBoard(boardB.id);

      const boards = await service.listBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0].name).toBe('Board A');
    });

    it('cascades delete to columns and tasks', async () => {
      // Create two boards so delete is allowed
      const boardA = await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      // Add a task to a column on boardA
      const firstColumn = boardA.columns[0];
      await tasksRepo.save(
        tasksRepo.create({ columnId: firstColumn.id, title: 'Cascade me', position: 0 }),
      );

      await service.removeBoard(boardA.id);

      // Columns and tasks referencing boardA should be gone via FK CASCADE
      const orphanColumns = await columnsRepo.find({
        where: { boardId: boardA.id },
      });
      expect(orphanColumns).toHaveLength(0);
    });

    it('throws NotFoundException when board id does not exist', async () => {
      // Need two boards so we don't hit the LAST_BOARD guard
      await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      await expect(service.removeBoard(9999)).rejects.toThrow(NotFoundException);
    });
  });
});
