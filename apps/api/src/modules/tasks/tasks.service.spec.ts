/**
 * tasks.service.spec.ts
 *
 * Vitest tests for TasksService.
 * Uses an in-memory better-sqlite3 DataSource (synchronize: true) so tests
 * are self-contained and require no external process.
 *
 * BDD scenarios covered (ICT-9):
 *   - "Create task via quick-add":     position = max+1 within column, priority defaults to 'medium'
 *   - "Reject empty title":            Zod schema rejects; verified via CreateTaskDtoSchema.safeParse
 *   - "Reject title over 200 chars":   Zod schema rejects; verified via CreateTaskDtoSchema.safeParse
 *   - "Move task between columns":     column_id + position updated correctly
 *   - "Completing a task sets completed_at":            move into is_done column sets completed_at
 *   - "Moving a completed task back clears completed_at": move out of is_done column clears completed_at
 *   - "Archive then restore a task":   softDelete sets archived_at; restore clears it
 *   - "Permanent delete from archive": permanentDelete throws NOT_ARCHIVED when not archived;
 *                                      removes row when archived
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from './entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { TasksService } from './tasks.service';
import { CreateTaskDtoSchema } from '@tasknote/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

async function seedBoardWithColumns(
  dataSource: DataSource,
): Promise<{ boardId: number; doingColumn: ColumnEntity; doneColumn: ColumnEntity; backlogColumn: ColumnEntity }> {
  const boardRepo = dataSource.getRepository(BoardEntity);
  const columnRepo = dataSource.getRepository(ColumnEntity);

  const board = await boardRepo.save(boardRepo.create({ name: 'Test Board', position: 0 }));

  const [backlogColumn, doingColumn, doneColumn] = await columnRepo.save([
    columnRepo.create({ boardId: board.id, name: 'Backlog', color: '#5B616B', isDone: false, position: 0 }),
    columnRepo.create({ boardId: board.id, name: 'Doing', color: '#F5C26B', isDone: false, position: 1 }),
    columnRepo.create({ boardId: board.id, name: 'Done', color: '#A3E635', isDone: true, position: 2 }),
  ]);

  return { boardId: board.id, doingColumn, doneColumn, backlogColumn };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let dataSource: DataSource;
  let tasksRepo: Repository<TaskEntity>;
  let columnsRepo: Repository<ColumnEntity>;
  let service: TasksService;

  // Column references populated per-test via seedBoardWithColumns
  let doingColumn: ColumnEntity;
  let doneColumn: ColumnEntity;
  let backlogColumn: ColumnEntity;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    tasksRepo = dataSource.getRepository(TaskEntity);
    columnsRepo = dataSource.getRepository(ColumnEntity);

    service = new TasksService(tasksRepo, columnsRepo, dataSource);

    const seeded = await seedBoardWithColumns(dataSource);
    doingColumn = seeded.doingColumn;
    doneColumn = seeded.doneColumn;
    backlogColumn = seeded.backlogColumn;
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── Zod schema validation (boundary layer) ──────────────────────────────────

  describe('CreateTaskDtoSchema — BDD: Reject empty title / Reject title over 200 chars', () => {
    it('rejects an empty title', () => {
      const result = CreateTaskDtoSchema.safeParse({
        column_id: 1,
        title: '',
        priority: 'medium',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const titleIssue = result.error.issues.find((i) => i.path[0] === 'title');
        expect(titleIssue?.message).toBe('Title is required');
      }
    });

    it('rejects a title over 200 characters', () => {
      const result = CreateTaskDtoSchema.safeParse({
        column_id: 1,
        title: 'a'.repeat(201),
        priority: 'medium',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const titleIssue = result.error.issues.find((i) => i.path[0] === 'title');
        expect(titleIssue?.message).toBe('Title must be ≤200 characters');
      }
    });

    it('accepts a valid title at the 200-character boundary', () => {
      const result = CreateTaskDtoSchema.safeParse({
        column_id: 1,
        title: 'a'.repeat(200),
        priority: 'medium',
      });
      expect(result.success).toBe(true);
    });
  });

  // ─── createTask ──────────────────────────────────────────────────────────────

  describe('createTask — BDD: Create task via quick-add', () => {
    it('assigns position=0 when column has no tasks yet', async () => {
      const task = await service.createTask({
        column_id: doingColumn.id,
        title: 'Review PR #42',
        priority: 'medium',
      });
      expect(task.position).toBe(0);
    });

    it('assigns position = max(position)+1 when column already has tasks', async () => {
      await tasksRepo.save(tasksRepo.create({ columnId: doingColumn.id, title: 'First', position: 0 }));
      await tasksRepo.save(tasksRepo.create({ columnId: doingColumn.id, title: 'Second', position: 1 }));

      const task = await service.createTask({
        column_id: doingColumn.id,
        title: 'Third',
        priority: 'medium',
      });
      expect(task.position).toBe(2);
    });

    it('defaults priority to medium when not provided (Zod default)', async () => {
      // CreateTaskDtoSchema applies the default before the DTO reaches the service
      const parsed = CreateTaskDtoSchema.parse({
        column_id: doingColumn.id,
        title: 'Review PR #42',
      });
      expect(parsed.priority).toBe('medium');

      const task = await service.createTask(parsed);
      expect(task.priority).toBe('medium');
    });

    it('stores priority when explicitly set', async () => {
      const task = await service.createTask({
        column_id: doingColumn.id,
        title: 'Urgent task',
        priority: 'high',
      });
      expect(task.priority).toBe('high');
    });

    it('throws NotFoundException when column does not exist', async () => {
      await expect(
        service.createTask({ column_id: 9999, title: 'Ghost task', priority: 'medium' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('stores due_date when provided as ISO string', async () => {
      const dueIso = '2026-06-01T12:00:00.000Z';
      const task = await service.createTask({
        column_id: doingColumn.id,
        title: 'Task with due date',
        priority: 'low',
        due_date: dueIso,
      });
      expect(task.dueDate).toBeDefined();
      expect(new Date(task.dueDate!).toISOString()).toBe(dueIso);
    });
  });

  // ─── getOne ──────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('returns the task with column relation loaded', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Review PR #42',
        priority: 'medium',
      });

      const task = await service.getOne(created.id);
      expect(task.id).toBe(created.id);
      expect(task.column).toBeDefined();
      expect(task.column.id).toBe(doingColumn.id);
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.getOne(9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTask ──────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('updates title in place without touching position or column', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Old title',
        priority: 'medium',
      });

      const updated = await service.updateTask(created.id, { title: 'New title' });
      expect(updated.title).toBe('New title');
      expect(updated.columnId).toBe(doingColumn.id);
      expect(updated.position).toBe(created.position);
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.updateTask(9999, { title: 'Ghost' })).rejects.toThrow(NotFoundException);
    });

    it('applies completed_at when column_id changes to a done column via PATCH', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Moving to done',
        priority: 'medium',
      });

      const updated = await service.updateTask(created.id, { column_id: doneColumn.id });
      expect(updated.completedAt).not.toBeNull();
    });

    it('clears completed_at when column_id changes from done column to non-done via PATCH', async () => {
      // Place task directly in done column with completed_at already set
      const task = await tasksRepo.save(
        tasksRepo.create({
          columnId: doneColumn.id,
          title: 'Was done',
          priority: 'medium',
          position: 0,
          completedAt: new Date(),
        }),
      );

      const updated = await service.updateTask(task.id, { column_id: doingColumn.id });
      expect(updated.completedAt).toBeNull();
    });
  });

  // ─── softDelete / restore ────────────────────────────────────────────────────

  describe('softDelete — BDD: Archive then restore a task', () => {
    it('sets archived_at on the task', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'To archive',
        priority: 'medium',
      });

      await service.softDelete(created.id);

      const inDb = await tasksRepo.findOne({ where: { id: created.id } });
      expect(inDb?.archivedAt).not.toBeNull();
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.softDelete(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore — BDD: Archive then restore a task', () => {
    it('clears archived_at and returns the updated task', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'To restore',
        priority: 'medium',
      });

      await service.softDelete(created.id);
      const restored = await service.restore(created.id);

      expect(restored.archivedAt).toBeNull();
      expect(restored.id).toBe(created.id);
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.restore(9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── moveTask ────────────────────────────────────────────────────────────────

  describe('moveTask — BDD: Move task between columns', () => {
    it('updates column_id and position', async () => {
      const created = await service.createTask({
        column_id: backlogColumn.id,
        title: 'Migrate to doing',
        priority: 'medium',
      });

      const moved = await service.moveTask({
        task_id: created.id,
        column_id: doingColumn.id,
        position: 1,
      });

      expect(moved.columnId).toBe(doingColumn.id);
      expect(moved.position).toBe(1);
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(
        service.moveTask({ task_id: 9999, column_id: doingColumn.id, position: 0 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when target column does not exist', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Lost task',
        priority: 'medium',
      });

      await expect(
        service.moveTask({ task_id: created.id, column_id: 9999, position: 0 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveTask — BDD: Completing a task sets completed_at', () => {
    it('sets completed_at when moved into a done column', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Finish me',
        priority: 'medium',
      });

      const moved = await service.moveTask({
        task_id: created.id,
        column_id: doneColumn.id,
        position: 0,
      });

      expect(moved.completedAt).not.toBeNull();
    });
  });

  describe('moveTask — BDD: Moving a completed task back clears completed_at', () => {
    it('clears completed_at when moved from done column to non-done column', async () => {
      // Place task directly in done column with completed_at set
      const task = await tasksRepo.save(
        tasksRepo.create({
          columnId: doneColumn.id,
          title: 'Was completed',
          priority: 'medium',
          position: 0,
          completedAt: new Date(),
        }),
      );

      const moved = await service.moveTask({
        task_id: task.id,
        column_id: doingColumn.id,
        position: 0,
      });

      expect(moved.completedAt).toBeNull();
    });

    it('does not change completed_at when moving within the same column', async () => {
      const completedAt = new Date('2026-01-01T00:00:00.000Z');
      const task = await tasksRepo.save(
        tasksRepo.create({
          columnId: doneColumn.id,
          title: 'Reorder within done',
          priority: 'medium',
          position: 0,
          completedAt,
        }),
      );

      const moved = await service.moveTask({
        task_id: task.id,
        column_id: doneColumn.id,
        position: 3,
      });

      // completed_at should remain as set; only position changes
      expect(moved.completedAt).not.toBeNull();
      expect(moved.position).toBe(3);
    });
  });

  // ─── permanentDelete ─────────────────────────────────────────────────────────

  describe('permanentDelete — BDD: Permanent delete from archive', () => {
    it('throws ConflictException with code NOT_ARCHIVED when task is not archived', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Not archived',
        priority: 'medium',
      });

      let caught: ConflictException | undefined;
      try {
        await service.permanentDelete(created.id);
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const response = caught!.getResponse() as { code: string; message: string };
      expect(response.code).toBe('NOT_ARCHIVED');
    });

    it('hard deletes the task row when it is archived', async () => {
      const created = await service.createTask({
        column_id: doingColumn.id,
        title: 'Delete permanently',
        priority: 'medium',
      });

      await service.softDelete(created.id);
      await service.permanentDelete(created.id);

      const inDb = await tasksRepo.findOne({ where: { id: created.id } });
      expect(inDb).toBeNull();
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.permanentDelete(9999)).rejects.toThrow(NotFoundException);
    });
  });
});
