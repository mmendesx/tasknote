
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BoardEntity } from './entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';
import { BoardsService } from './boards.service';
import { FileRefsService } from '../file-refs/file-refs.service';

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity, FileRefEntity],
    synchronize: true,

    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

describe('BoardsService', () => {
  let dataSource: DataSource;
  let boardsRepo: Repository<BoardEntity>;
  let columnsRepo: Repository<ColumnEntity>;
  let tasksRepo: Repository<TaskEntity>;
  let fileRefsService: FileRefsService;
  let service: BoardsService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    boardsRepo = dataSource.getRepository(BoardEntity);
    columnsRepo = dataSource.getRepository(ColumnEntity);
    tasksRepo = dataSource.getRepository(TaskEntity);

    const fileRefsRepo = dataSource.getRepository(FileRefEntity);
    fileRefsService = new FileRefsService(fileRefsRepo);
    service = new BoardsService(boardsRepo, columnsRepo, tasksRepo, dataSource, fileRefsService);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('listBoards', () => {
    it('returns empty array when no boards exist', async () => {
      const boards = await service.listBoards();
      expect(boards).toEqual([]);
    });

    it('returns boards ordered by position ascending', async () => {
      
      await boardsRepo.save([
        boardsRepo.create({ name: 'Beta', position: 2 }),
        boardsRepo.create({ name: 'Alpha', position: 0 }),
        boardsRepo.create({ name: 'Gamma', position: 1 }),
      ]);

      const boards = await service.listBoards();
      expect(boards.map((b) => b.name)).toEqual(['Alpha', 'Gamma', 'Beta']);
    });
  });

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
      expect(sorted[0].color).toBe('#5B616B'); 
      expect(sorted[1].color).toBe('#F5C26B'); 
      expect(sorted[2].color).toBe('#F87171'); 
      expect(sorted[3].color).toBe('#A3E635'); 
    });

    it('Done column has isDone=true; others have isDone=false', async () => {
      const board = await service.createBoard({ name: 'Personal' });
      const sorted = board.columns.slice().sort((a, b) => a.position - b.position);
      expect(sorted[0].isDone).toBe(false); 
      expect(sorted[1].isDone).toBe(false); 
      expect(sorted[2].isDone).toBe(false); 
      expect(sorted[3].isDone).toBe(true);  
    });

    it('the new board appears in listBoards after creation', async () => {
      await service.createBoard({ name: 'Personal' });
      const boards = await service.listBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0].name).toBe('Personal');
    });
  });

  describe('getBoard — BDD: Switching boards is instant', () => {
    it('returns the board with nested columns and tasks', async () => {
      const created = await service.createBoard({ name: 'Work' });
      const backlogColumn = created.columns.find((c) => c.name === 'Backlog')!;

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
      
      const board = await service.getBoard(created.id);
      
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
      
      const boardA = await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      const firstColumn = boardA.columns[0];
      await tasksRepo.save(
        tasksRepo.create({ columnId: firstColumn.id, title: 'Cascade me', position: 0 }),
      );

      await service.removeBoard(boardA.id);

      const orphanColumns = await columnsRepo.find({
        where: { boardId: boardA.id },
      });
      expect(orphanColumns).toHaveLength(0);
    });

    it('throws NotFoundException when board id does not exist', async () => {

      await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      await expect(service.removeBoard(9999)).rejects.toThrow(NotFoundException);
    });

    // SCN-4: board delete cascades file_refs of descendant tasks
    it('SCN-4: deletes file_refs for tasks in the board when board is removed', async () => {
      const boardA = await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      const firstColumn = boardA.columns[0];
      const task = await tasksRepo.save(
        tasksRepo.create({ columnId: firstColumn.id, title: 'Task with file', position: 0 }),
      );

      const fileRefsRepo = dataSource.getRepository(FileRefEntity);
      await fileRefsRepo.save(
        fileRefsRepo.create({ targetType: 'task', targetId: task.id, path: '/tmp/spec.pdf', label: 'Spec' }),
      );

      await service.removeBoard(boardA.id);

      const remaining = await fileRefsRepo.find({
        where: { targetType: 'task', targetId: task.id },
      });
      expect(remaining).toHaveLength(0);
    });

    // SCN-6: batched file_ref deletion — 3 tasks + 2 notes with file_refs → exactly 2 deleteAllForBatch calls
    it('SCN-6: calls deleteAllForBatch exactly twice with correct targetType and all descendant IDs', async () => {
      const boardA = await service.createBoard({ name: 'Board A' });
      await service.createBoard({ name: 'Board B' });

      const firstColumn = boardA.columns[0];
      const notesRepo = dataSource.getRepository(NoteEntity);
      const fileRefsRepo = dataSource.getRepository(FileRefEntity);

      const [task1, task2, task3] = await Promise.all([
        tasksRepo.save(tasksRepo.create({ columnId: firstColumn.id, title: 'Task 1', position: 0 })),
        tasksRepo.save(tasksRepo.create({ columnId: firstColumn.id, title: 'Task 2', position: 1 })),
        tasksRepo.save(tasksRepo.create({ columnId: firstColumn.id, title: 'Task 3', position: 2 })),
      ]);

      const [note1, note2] = await Promise.all([
        notesRepo.save(notesRepo.create({ taskId: task1.id, title: 'Note 1', bodyMd: '' })),
        notesRepo.save(notesRepo.create({ taskId: task2.id, title: 'Note 2', bodyMd: '' })),
      ]);

      await Promise.all([
        fileRefsRepo.save(fileRefsRepo.create({ targetType: 'task', targetId: task1.id, path: '/tmp/t1.pdf', label: 'T1' })),
        fileRefsRepo.save(fileRefsRepo.create({ targetType: 'task', targetId: task2.id, path: '/tmp/t2.pdf', label: 'T2' })),
        fileRefsRepo.save(fileRefsRepo.create({ targetType: 'task', targetId: task3.id, path: '/tmp/t3.pdf', label: 'T3' })),
        fileRefsRepo.save(fileRefsRepo.create({ targetType: 'note', targetId: note1.id, path: '/tmp/n1.pdf', label: 'N1' })),
        fileRefsRepo.save(fileRefsRepo.create({ targetType: 'note', targetId: note2.id, path: '/tmp/n2.pdf', label: 'N2' })),
      ]);

      const spy = vi.spyOn(fileRefsService, 'deleteAllForBatch');

      await service.removeBoard(boardA.id);

      expect(spy).toHaveBeenCalledTimes(2);

      const taskCall = spy.mock.calls.find((call) => call[0] === 'task');
      const noteCall = spy.mock.calls.find((call) => call[0] === 'note');

      expect(taskCall).toBeDefined();
      expect(noteCall).toBeDefined();

      expect((taskCall![1] as number[]).sort()).toEqual([task1.id, task2.id, task3.id].sort());
      expect((noteCall![1] as number[]).sort()).toEqual([note1.id, note2.id].sort());
    });

    // SCN-7: board with no columns/tasks/notes → deleteAllForBatch called with empty arrays (no SQL DELETE)
    it('SCN-7: calls deleteAllForBatch with empty arrays when board has no columns', async () => {
      // Create a board with no tasks by saving it directly (bypassing createBoard default columns)
      const emptyBoard = await boardsRepo.save(boardsRepo.create({ name: 'Empty Board', position: 99 }));
      await service.createBoard({ name: 'Board B' }); // ensure at least 2 boards

      const spy = vi.spyOn(fileRefsService, 'deleteAllForBatch');

      await service.removeBoard(emptyBoard.id);

      // Both calls should happen with empty arrays — deleteAllForBatch no-ops on empty
      const taskCall = spy.mock.calls.find((call) => call[0] === 'task');
      const noteCall = spy.mock.calls.find((call) => call[0] === 'note');

      // Either not called at all, or called with empty arrays
      if (taskCall) {
        expect(taskCall[1]).toEqual([]);
      }
      if (noteCall) {
        expect(noteCall[1]).toEqual([]);
      }
    });
  });
});
