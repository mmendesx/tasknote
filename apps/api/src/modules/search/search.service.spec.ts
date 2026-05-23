/**
 * search.service.spec.ts
 *
 * Vitest tests for SearchService.
 * Uses an in-memory better-sqlite3 DataSource (synchronize: true) so tests are
 * self-contained and require no external process.
 *
 * BDD scenarios covered:
 *   - "Empty query returns no results": empty or whitespace-only q → empty groups
 *   - "Search finds matches across types": q='onboard' matches task title, note body, file label
 *   - LIKE escaping: q='50%' only matches a row containing the literal string "50%",
 *     not an unrelated row whose label happens to contain "50" followed by other chars.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { SearchService } from './search.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Creates the minimum board + column structure so TaskEntity FK constraints are
 * satisfied when inserting test tasks.
 */
async function seedColumn(
  boardsRepo: Repository<BoardEntity>,
  columnsRepo: Repository<ColumnEntity>,
): Promise<ColumnEntity> {
  const board = await boardsRepo.save(boardsRepo.create({ name: 'Test Board', position: 0 }));
  return columnsRepo.save(
    columnsRepo.create({ boardId: board.id, name: 'Backlog', position: 0, color: '#000' }),
  );
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let dataSource: DataSource;
  let tasksRepo: Repository<TaskEntity>;
  let notesRepo: Repository<NoteEntity>;
  let fileRefsRepo: Repository<FileRefEntity>;
  let boardsRepo: Repository<BoardEntity>;
  let columnsRepo: Repository<ColumnEntity>;
  let service: SearchService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    tasksRepo = dataSource.getRepository(TaskEntity);
    notesRepo = dataSource.getRepository(NoteEntity);
    fileRefsRepo = dataSource.getRepository(FileRefEntity);
    boardsRepo = dataSource.getRepository(BoardEntity);
    columnsRepo = dataSource.getRepository(ColumnEntity);

    service = new SearchService(tasksRepo, notesRepo, fileRefsRepo);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── BDD: Empty query returns no results ────────────────────────────────────

  describe('empty query returns empty groups', () => {
    it('returns empty groups when q is an empty string', async () => {
      const result = await service.search('');
      expect(result).toEqual({ tasks: [], notes: [], files: [] });
    });

    it('returns empty groups when q is whitespace-only', async () => {
      const result = await service.search('   ');
      expect(result).toEqual({ tasks: [], notes: [], files: [] });
    });

    it('returns empty groups for empty query even when data exists', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);
      await tasksRepo.save(tasksRepo.create({ columnId: col.id, title: 'Has data', position: 0 }));

      const result = await service.search('');
      expect(result).toEqual({ tasks: [], notes: [], files: [] });
    });
  });

  // ─── BDD: Search finds matches across types ──────────────────────────────────

  describe('search finds matches across types', () => {
    it('q="onboard" matches task title, note body, and file label', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);

      // Task: title matches
      await tasksRepo.save(
        tasksRepo.create({ columnId: col.id, title: 'Onboarding deck', position: 0 }),
      );

      // Note: body matches (title does not)
      await notesRepo.save(
        notesRepo.create({ title: 'Sprint notes', bodyMd: 'Completed onboarding checklist' }),
      );

      // File ref: label matches
      await fileRefsRepo.save(
        fileRefsRepo.create({
          targetType: 'task',
          targetId: 1,
          path: '/docs/onboarding.pdf',
          label: 'onboarding.pdf',
        }),
      );

      const result = await service.search('onboard');

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe('Onboarding deck');

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].bodyMd).toContain('onboarding');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].label).toBe('onboarding.pdf');
    });

    it('case-insensitive: q="ONBOARD" matches lowercase data', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);
      await tasksRepo.save(
        tasksRepo.create({ columnId: col.id, title: 'onboarding session', position: 0 }),
      );

      const result = await service.search('ONBOARD');
      expect(result.tasks).toHaveLength(1);
    });

    it('excludes archived tasks from results', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);
      await tasksRepo.save(
        tasksRepo.create({
          columnId: col.id,
          title: 'Onboarding archived',
          position: 0,
          archivedAt: new Date(),
        }),
      );

      const result = await service.search('onboard');
      expect(result.tasks).toHaveLength(0);
    });

    it('excludes archived notes from results', async () => {
      await notesRepo.save(
        notesRepo.create({
          title: 'Onboarding notes',
          bodyMd: 'onboarding content',
          archivedAt: new Date(),
        }),
      );

      const result = await service.search('onboard');
      expect(result.notes).toHaveLength(0);
    });

    it('returns no results when nothing matches', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);
      await tasksRepo.save(
        tasksRepo.create({ columnId: col.id, title: 'Completely unrelated', position: 0 }),
      );

      const result = await service.search('xyznotfound');
      expect(result).toEqual({ tasks: [], notes: [], files: [] });
    });

    it('searches task description_md in addition to title', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);
      await tasksRepo.save(
        tasksRepo.create({
          columnId: col.id,
          title: 'Quarterly review',
          descriptionMd: 'See onboarding doc for context',
          position: 0,
        }),
      );

      const result = await service.search('onboarding doc');
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe('Quarterly review');
    });
  });

  // ─── LIKE escaping: q='50%' must not match '500' ────────────────────────────

  describe('LIKE escaping prevents unintended wildcard expansion', () => {
    it('q="50%" matches only labels containing the literal string "50%" and not "500"', async () => {
      // This is the discriminating row: label is exactly "50% complete"
      await fileRefsRepo.save(
        fileRefsRepo.create({
          targetType: 'task',
          targetId: 1,
          path: '/reports/progress.pdf',
          label: '50% complete',
        }),
      );

      // Unrelated row: contains "50" followed by other characters but NOT a literal "%"
      // Without LIKE escaping, the pattern '%50%%' would treat the second % as a wildcard
      // and match this row (since "500 items" contains "50" followed by anything).
      await fileRefsRepo.save(
        fileRefsRepo.create({
          targetType: 'task',
          targetId: 2,
          path: '/reports/items.pdf',
          label: '500 items processed',
        }),
      );

      const result = await service.search('50%');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].label).toBe('50% complete');
    });

    it('q="100_" matches only labels containing the literal underscore', async () => {
      await fileRefsRepo.save(
        fileRefsRepo.create({
          targetType: 'note',
          targetId: 1,
          path: '/docs/coverage.txt',
          label: '100_coverage',
        }),
      );

      // Without escaping, LIKE '100_' would treat _ as a single-char wildcard,
      // matching "100X", "100Y", etc.
      await fileRefsRepo.save(
        fileRefsRepo.create({
          targetType: 'note',
          targetId: 2,
          path: '/docs/other.txt',
          label: '100x multiplier',
        }),
      );

      const result = await service.search('100_');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].label).toBe('100_coverage');
    });
  });

  // ─── Result cap ─────────────────────────────────────────────────────────────

  describe('results are capped at 20 per group', () => {
    it('returns at most 20 tasks even when more than 20 match', async () => {
      const col = await seedColumn(boardsRepo, columnsRepo);

      const tasks = Array.from({ length: 25 }, (_, i) =>
        tasksRepo.create({ columnId: col.id, title: `search-me task ${i}`, position: i }),
      );
      await tasksRepo.save(tasks);

      const result = await service.search('search-me');
      expect(result.tasks.length).toBeLessThanOrEqual(20);
    });

    it('returns at most 20 notes even when more than 20 match', async () => {
      const notes = Array.from({ length: 25 }, (_, i) =>
        notesRepo.create({ title: `search-me note ${i}`, bodyMd: 'search-me content' }),
      );
      await notesRepo.save(notes);

      const result = await service.search('search-me');
      expect(result.notes.length).toBeLessThanOrEqual(20);
    });
  });
});
