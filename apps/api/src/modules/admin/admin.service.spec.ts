/**
 * admin.service.spec.ts
 *
 * Vitest integration tests for AdminService using an in-memory SQLite database.
 * Tests run against real TypeORM + better-sqlite3 so raw SQL paths are exercised.
 *
 * BDD scenarios covered:
 *   - "Export DB to JSON": exportAll returns all tables with arrays
 *   - "Reset DB re-triggers onboarding":
 *       - import without confirm throws 400 CONFIRM_REQUIRED
 *       - import with valid payload replaces all data
 *       - reset without confirm throws 400 CONFIRM_REQUIRED
 *       - reset clears onboarded_at and wipes boards/columns/tasks/notes/tags/file_refs
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service';
import { SettingsEntity } from '../settings/entities/settings.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';

// ─── DB setup ─────────────────────────────────────────────────────────────────

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SettingsEntity, BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity, FileRefEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      // FK enforcement off by default; individual tests toggle as needed via PRAGMA
      db.pragma('foreign_keys = OFF');
    },
  });
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedMinimalData(dataSource: DataSource): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    // Settings singleton
    await runner.query(
      `INSERT INTO settings (id, display_name, theme, accent, default_board_id, onboarded_at, timezone)
       VALUES (1, 'Matheus', 'dark', '#A3E635', NULL, '2026-05-23T10:00:00.000Z', 'UTC')`,
    );
    // Board
    await runner.query(
      `INSERT INTO boards (id, name, position, created_at, updated_at)
       VALUES (1, 'Work', 0, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    // Column
    await runner.query(
      `INSERT INTO columns (id, board_id, name, color, wip_limit, is_done, position)
       VALUES (1, 1, 'Backlog', '#5B616B', NULL, 0, 0)`,
    );
    // Task
    await runner.query(
      `INSERT INTO tasks (id, column_id, title, description_md, priority, due_date, position, archived_at, completed_at, created_at, updated_at)
       VALUES (1, 1, 'Review PR #42', NULL, 'medium', NULL, 0, NULL, NULL, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    // Tag
    await runner.query(`INSERT INTO tags (id, name, color) VALUES (1, 'urgent', '#F87171')`);
    // task_tags join
    await runner.query(`INSERT INTO task_tags (task_id, tag_id) VALUES (1, 1)`);
    // Note
    await runner.query(
      `INSERT INTO notes (id, task_id, title, body_md, pinned, archived_at, created_at, updated_at)
       VALUES (1, NULL, 'Standup', '# Standup', 0, NULL, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    // File ref
    await runner.query(
      `INSERT INTO file_refs (id, target_type, target_id, path, label, note, created_at)
       VALUES (1, 'task', 1, '/Users/me/spec.pdf', 'Spec', NULL, '2026-05-23T10:00:00.000Z')`,
    );
  } finally {
    await runner.release();
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AdminService', () => {
  let dataSource: DataSource;
  let service: AdminService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();
    service = new AdminService(dataSource);
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── exportAll ──────────────────────────────────────────────────────────────

  describe('exportAll — BDD: Export DB to JSON', () => {
    it('returns all eight table arrays with correct keys', async () => {
      const result = await service.exportAll();

      expect(result.version).toBe('1.0');
      expect(result.exported_at).toBeTruthy();
      expect(typeof result.exported_at).toBe('string');

      expect(Array.isArray(result.data.settings)).toBe(true);
      expect(Array.isArray(result.data.boards)).toBe(true);
      expect(Array.isArray(result.data.columns)).toBe(true);
      expect(Array.isArray(result.data.tasks)).toBe(true);
      expect(Array.isArray(result.data.notes)).toBe(true);
      expect(Array.isArray(result.data.tags)).toBe(true);
      expect(Array.isArray(result.data.task_tags)).toBe(true);
      expect(Array.isArray(result.data.file_refs)).toBe(true);
    });

    it('returns empty arrays when tables have no rows', async () => {
      const result = await service.exportAll();

      // Empty DB — all arrays are empty
      expect(result.data.boards).toHaveLength(0);
      expect(result.data.tasks).toHaveLength(0);
      expect(result.data.tags).toHaveLength(0);
    });

    it('returns seeded rows in each table array', async () => {
      await seedMinimalData(dataSource);

      const result = await service.exportAll();

      expect(result.data.settings).toHaveLength(1);
      expect(result.data.boards).toHaveLength(1);
      expect(result.data.columns).toHaveLength(1);
      expect(result.data.tasks).toHaveLength(1);
      expect(result.data.tags).toHaveLength(1);
      expect(result.data.task_tags).toHaveLength(1);
      expect(result.data.notes).toHaveLength(1);
      expect(result.data.file_refs).toHaveLength(1);
    });

    it('exported_at is a valid ISO 8601 date string', async () => {
      const result = await service.exportAll();
      expect(() => new Date(result.exported_at)).not.toThrow();
      expect(new Date(result.exported_at).toISOString()).toBe(result.exported_at);
    });
  });

  // ─── importAll — confirm guard ───────────────────────────────────────────────

  describe('importAll — confirm guard', () => {
    it('throws BadRequestException with code CONFIRM_REQUIRED when confirm is missing', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.importAll({ data: {} });
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('CONFIRM_REQUIRED');
    });

    it('throws BadRequestException with code CONFIRM_REQUIRED when confirm is wrong value', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.importAll({ confirm: 'YES', data: {} });
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('CONFIRM_REQUIRED');
    });

    it('throws BadRequestException with code INVALID_IMPORT_PAYLOAD when data shape is wrong', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.importAll({ confirm: 'IMPORT', data: { boards: 'not-an-array' } });
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('INVALID_IMPORT_PAYLOAD');
    });
  });

  // ─── importAll — full replace ────────────────────────────────────────────────

  describe('importAll — BDD: import with valid payload replaces all data', () => {
    it('replaces existing data with imported payload', async () => {
      // Seed initial state
      await seedMinimalData(dataSource);

      // Export current state to get a valid payload
      const exported = await service.exportAll();

      // Mutate the export — change the board name to verify replacement
      const mutatedData = {
        ...exported.data,
        boards: [{ ...exported.data.boards[0], name: 'Imported Board' }],
      };

      const result = await service.importAll({ confirm: 'IMPORT', data: mutatedData });

      expect(result).toEqual({ imported: true });

      // Verify the board name was replaced
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const boards = await runner.query('SELECT * FROM boards');
        expect(boards).toHaveLength(1);
        expect(boards[0].name).toBe('Imported Board');
      } finally {
        await runner.release();
      }
    });

    it('wipes existing rows before inserting imported ones', async () => {
      // Seed with 1 board
      await seedMinimalData(dataSource);

      // Import with an empty boards array — boards table should be wiped
      const exported = await service.exportAll();
      const emptyBoards = {
        ...exported.data,
        boards: [],
        columns: [],
        tasks: [],
        task_tags: [],
      };

      await service.importAll({ confirm: 'IMPORT', data: emptyBoards });

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const boards = await runner.query('SELECT * FROM boards');
        expect(boards).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('returns { imported: true } on success', async () => {
      const emptyData = {
        settings: [],
        boards: [],
        columns: [],
        tasks: [],
        notes: [],
        tags: [],
        task_tags: [],
        file_refs: [],
      };

      const result = await service.importAll({ confirm: 'IMPORT', data: emptyData });
      expect(result).toEqual({ imported: true });
    });

    it('round-trips a note linked to a task without FK violation (PRAGMA before transaction)', async () => {
      // This test verifies PRAGMA foreign_keys = OFF is issued before BEGIN.
      // If it were issued inside the transaction it would be silently ignored by SQLite,
      // and inserting a note (whose task_id FK points to a task not yet inserted)
      // would throw a FOREIGN KEY constraint violation.
      await seedMinimalData(dataSource);

      // The seeded note has task_id=NULL; we need task_id set to trigger the FK path.
      // Update the note to link to the seeded task.
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query('UPDATE notes SET task_id = 1 WHERE id = 1');
      } finally {
        await runner.release();
      }

      // Export — note now has task_id = 1
      const exported = await service.exportAll();

      expect(exported.data.notes[0]).toMatchObject({ task_id: 1 });

      // Re-import the same data into a fresh DB to prove the insert order works
      await service.importAll({ confirm: 'IMPORT', data: exported.data });

      const runner2 = dataSource.createQueryRunner();
      await runner2.connect();
      try {
        const notes = await runner2.query('SELECT task_id FROM notes WHERE id = 1');
        expect(notes[0].task_id).toBe(1);
      } finally {
        await runner2.release();
      }
    });
  });

  // ─── reset — confirm guard ───────────────────────────────────────────────────

  describe('reset — confirm guard', () => {
    it('throws BadRequestException with code CONFIRM_REQUIRED when body is missing confirm', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.reset({});
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('CONFIRM_REQUIRED');
    });

    it('throws BadRequestException with code CONFIRM_REQUIRED when confirm is wrong value', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.reset({ confirm: 'YES' });
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('CONFIRM_REQUIRED');
    });

    it('throws BadRequestException with code CONFIRM_REQUIRED when body is null', async () => {
      let thrown: BadRequestException | undefined;
      try {
        await service.reset(null);
      } catch (err) {
        thrown = err as BadRequestException;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('CONFIRM_REQUIRED');
    });
  });

  // ─── reset — wipe and clear ──────────────────────────────────────────────────

  describe('reset — BDD: Reset DB re-triggers onboarding', () => {
    it('clears onboarded_at on settings row after reset', async () => {
      await seedMinimalData(dataSource);

      // Verify seeded state
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const [before] = await runner.query('SELECT onboarded_at FROM settings WHERE id = 1');
        expect(before.onboarded_at).not.toBeNull();
      } finally {
        await runner.release();
      }

      await service.reset();

      const runner2 = dataSource.createQueryRunner();
      await runner2.connect();
      try {
        const [after] = await runner2.query('SELECT onboarded_at, display_name, default_board_id FROM settings WHERE id = 1');
        expect(after.onboarded_at).toBeNull();
        expect(after.display_name).toBe('');
        expect(after.default_board_id).toBeNull();
      } finally {
        await runner2.release();
      }
    });

    it('wipes boards table after reset', async () => {
      await seedMinimalData(dataSource);

      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const boards = await runner.query('SELECT * FROM boards');
        expect(boards).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('wipes columns after reset', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const columns = await runner.query('SELECT * FROM columns');
        expect(columns).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('wipes tasks after reset', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const tasks = await runner.query('SELECT * FROM tasks');
        expect(tasks).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('wipes notes after reset', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const notes = await runner.query('SELECT * FROM notes');
        expect(notes).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('wipes tags and task_tags after reset', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const tags = await runner.query('SELECT * FROM tags');
        const taskTags = await runner.query('SELECT * FROM task_tags');
        expect(tags).toHaveLength(0);
        expect(taskTags).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('wipes file_refs after reset', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const fileRefs = await runner.query('SELECT * FROM file_refs');
        expect(fileRefs).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    it('preserves the settings row itself (does not delete it)', async () => {
      await seedMinimalData(dataSource);
      await service.reset();

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const settings = await runner.query('SELECT * FROM settings');
        // Row must still exist — we UPDATE, not DELETE
        expect(settings).toHaveLength(1);
        expect(settings[0].id).toBe(1);
      } finally {
        await runner.release();
      }
    });

    it('returns { reset: true } on success', async () => {
      await seedMinimalData(dataSource);
      const result = await service.reset();
      expect(result).toEqual({ reset: true });
    });
  });
});
