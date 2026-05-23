/**
 * tags.service.spec.ts
 *
 * Vitest tests for TagsService.
 * Uses an in-memory better-sqlite3 DataSource (synchronize: true) so tests
 * are self-contained and require no external process.
 *
 * BDD scenarios covered (FR-7):
 *   - "Filter board by tag": tags can be listed, created, linked to tasks
 *   - "Create with duplicate name throws DUPLICATE_TAG" (ICT-11 constraint)
 *   - "addTagToTask is idempotent" (ICT-11 constraint)
 *   - "removeTagFromTask is no-op on missing link" (ICT-11 constraint)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from './entities/tag.entity';
import { TagsService } from './tags.service';

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

async function seedBoardColumnTask(
  dataSource: DataSource,
): Promise<{ board: BoardEntity; column: ColumnEntity; task: TaskEntity }> {
  const boardRepo = dataSource.getRepository(BoardEntity);
  const columnRepo = dataSource.getRepository(ColumnEntity);
  const taskRepo = dataSource.getRepository(TaskEntity);

  const board = await boardRepo.save(boardRepo.create({ name: 'Test Board', position: 0 }));
  const column = await columnRepo.save(
    columnRepo.create({ boardId: board.id, name: 'Backlog', color: '#5B616B', position: 0 }),
  );
  const task = await taskRepo.save(
    taskRepo.create({ columnId: column.id, title: 'Test Task', position: 0 }),
  );

  return { board, column, task };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TagsService', () => {
  let dataSource: DataSource;
  let tagsRepo: Repository<TagEntity>;
  let tasksRepo: Repository<TaskEntity>;
  let service: TagsService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    tagsRepo = dataSource.getRepository(TagEntity);
    tasksRepo = dataSource.getRepository(TaskEntity);

    service = new TagsService(tagsRepo, tasksRepo, dataSource);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── listTags ────────────────────────────────────────────────────────────────

  describe('listTags', () => {
    it('returns empty array when no tags exist', async () => {
      const tags = await service.listTags();
      expect(tags).toEqual([]);
    });

    it('returns tags ordered by name ascending', async () => {
      await tagsRepo.save([
        tagsRepo.create({ name: 'zebra', color: '#fff' }),
        tagsRepo.create({ name: 'alpha', color: '#fff' }),
        tagsRepo.create({ name: 'mango', color: '#fff' }),
      ]);

      const tags = await service.listTags();
      expect(tags.map((t) => t.name)).toEqual(['alpha', 'mango', 'zebra']);
    });
  });

  // ─── createTag ───────────────────────────────────────────────────────────────

  describe('createTag', () => {
    it('creates a tag and returns it with an assigned id', async () => {
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });
      expect(tag.id).toBeDefined();
      expect(tag.name).toBe('urgent');
      expect(tag.color).toBe('#F87171');
    });

    it('BDD DUPLICATE_TAG: throws ConflictException with code DUPLICATE_TAG on duplicate name', async () => {
      await service.createTag({ name: 'urgent', color: '#F87171' });

      let caught: ConflictException | undefined;
      try {
        await service.createTag({ name: 'urgent', color: '#000' });
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as { code: string; message: string };
      expect(body.code).toBe('DUPLICATE_TAG');
    });

    it('documents current behavior: name uniqueness is case-sensitive under default SQLite collation', async () => {
      // This is an observation of SQLite TEXT collation behavior, NOT a
      // contractual requirement. If a COLLATE NOCASE constraint is ever added
      // to the column, this test should be updated accordingly.
      await service.createTag({ name: 'urgent', color: '#F87171' });
      const tag = await service.createTag({ name: 'Urgent', color: '#000' });
      expect(tag.name).toBe('Urgent');
    });
  });

  // ─── updateTag ───────────────────────────────────────────────────────────────

  describe('updateTag', () => {
    it('updates the tag name', async () => {
      const tag = await service.createTag({ name: 'old', color: '#fff' });
      const updated = await service.updateTag(tag.id, { name: 'new' });
      expect(updated.name).toBe('new');
    });

    it('updates the tag color only', async () => {
      const tag = await service.createTag({ name: 'urgent', color: '#fff' });
      const updated = await service.updateTag(tag.id, { color: '#F87171' });
      expect(updated.color).toBe('#F87171');
      expect(updated.name).toBe('urgent');
    });

    it('throws ConflictException DUPLICATE_TAG when renaming to an existing name', async () => {
      await service.createTag({ name: 'alpha', color: '#fff' });
      const beta = await service.createTag({ name: 'beta', color: '#fff' });

      let caught: ConflictException | undefined;
      try {
        await service.updateTag(beta.id, { name: 'alpha' });
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as { code: string };
      expect(body.code).toBe('DUPLICATE_TAG');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.updateTag(9999, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeTag ───────────────────────────────────────────────────────────────

  describe('removeTag', () => {
    it('removes an existing tag', async () => {
      const tag = await service.createTag({ name: 'to-remove', color: '#fff' });
      await service.removeTag(tag.id);
      const tags = await service.listTags();
      expect(tags).toHaveLength(0);
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.removeTag(9999)).rejects.toThrow(NotFoundException);
    });

    it('cascade removes task_tags rows when tag is deleted', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });

      await service.addTagToTask(task.id, tag.id);

      // Verify link exists before deletion
      const taskBefore = await tasksRepo.findOne({ where: { id: task.id }, relations: ['tags'] });
      expect(taskBefore!.tags).toHaveLength(1);

      await service.removeTag(tag.id);

      // After tag deletion, the task_tags row must be gone
      const taskAfter = await tasksRepo.findOne({ where: { id: task.id }, relations: ['tags'] });
      expect(taskAfter!.tags).toHaveLength(0);
    });
  });

  // ─── addTagToTask ────────────────────────────────────────────────────────────

  describe('addTagToTask', () => {
    it('links a tag to a task', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });

      await service.addTagToTask(task.id, tag.id);

      const updated = await tasksRepo.findOne({ where: { id: task.id }, relations: ['tags'] });
      expect(updated!.tags).toHaveLength(1);
      expect(updated!.tags[0].id).toBe(tag.id);
    });

    it('BDD idempotent: calling addTagToTask twice does not create a duplicate link', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });

      await service.addTagToTask(task.id, tag.id);
      await service.addTagToTask(task.id, tag.id); // second call — must be a no-op

      const updated = await tasksRepo.findOne({ where: { id: task.id }, relations: ['tags'] });
      expect(updated!.tags).toHaveLength(1);
    });

    it('throws NotFoundException when task does not exist', async () => {
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });
      await expect(service.addTagToTask(9999, tag.id)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when tag does not exist', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      await expect(service.addTagToTask(task.id, 9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeTagFromTask ───────────────────────────────────────────────────────

  describe('removeTagFromTask', () => {
    it('unlinks a tag from a task', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });

      await service.addTagToTask(task.id, tag.id);
      await service.removeTagFromTask(task.id, tag.id);

      const updated = await tasksRepo.findOne({ where: { id: task.id }, relations: ['tags'] });
      expect(updated!.tags).toHaveLength(0);
    });

    it('BDD no-op on missing link: does not throw when link does not exist', async () => {
      const { task } = await seedBoardColumnTask(dataSource);
      const tag = await service.createTag({ name: 'urgent', color: '#F87171' });

      // Never linked — must not throw
      await expect(service.removeTagFromTask(task.id, tag.id)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when task does not exist', async () => {
      await expect(service.removeTagFromTask(9999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
