
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service';
import { COLUMN_ALLOWLISTS, DELETE_ORDER } from './admin.constants';
import { SettingsEntity } from '../settings/entities/settings.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SettingsEntity, BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity, FileRefEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      
      db.pragma('foreign_keys = OFF');
    },
  });
}

async function seedMinimalData(dataSource: DataSource): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    
    await runner.query(
      `INSERT INTO settings (id, display_name, theme, accent, default_board_id, onboarded_at, timezone)
       VALUES (1, 'Matheus', 'dark', '#A3E635', NULL, '2026-05-23T10:00:00.000Z', 'UTC')`,
    );
    
    await runner.query(
      `INSERT INTO boards (id, name, position, created_at, updated_at)
       VALUES (1, 'Work', 0, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    
    await runner.query(
      `INSERT INTO columns (id, board_id, name, color, wip_limit, is_done, position)
       VALUES (1, 1, 'Backlog', '#5B616B', NULL, 0, 0)`,
    );
    
    await runner.query(
      `INSERT INTO tasks (id, column_id, title, description_md, priority, due_date, position, archived_at, completed_at, created_at, updated_at)
       VALUES (1, 1, 'Review PR #42', NULL, 'medium', NULL, 0, NULL, NULL, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    
    await runner.query(`INSERT INTO tags (id, name, color) VALUES (1, 'urgent', '#F87171')`);
    
    await runner.query(`INSERT INTO task_tags (task_id, tag_id) VALUES (1, 1)`);
    
    await runner.query(
      `INSERT INTO notes (id, task_id, title, body_md, pinned, archived_at, created_at, updated_at)
       VALUES (1, NULL, 'Standup', '# Standup', 0, NULL, '2026-05-23T10:00:00.000Z', '2026-05-23T10:00:00.000Z')`,
    );
    
    await runner.query(
      `INSERT INTO file_refs (id, target_type, target_id, path, label, note, created_at)
       VALUES (1, 'task', 1, '/Users/me/spec.pdf', 'Spec', NULL, '2026-05-23T10:00:00.000Z')`,
    );
  } finally {
    await runner.release();
  }
}

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

  describe('importAll — BDD: import with valid payload replaces all data', () => {
    it('replaces existing data with imported payload', async () => {
      
      await seedMinimalData(dataSource);

      const exported = await service.exportAll();

      const mutatedData = {
        ...exported.data,
        boards: [{ ...exported.data.boards[0], name: 'Imported Board' }],
      };

      const result = await service.importAll({ confirm: 'IMPORT', data: mutatedData });

      expect(result).toEqual({ imported: true });

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
      
      await seedMinimalData(dataSource);

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

    // SCN-1: rejects unknown column names
    it('SCN-1: throws ConflictException with code IMPORT_BAD_COLUMN for unknown task column', async () => {
      const emptyBase = {
        settings: [],
        boards: [],
        columns: [],
        notes: [],
        tags: [],
        task_tags: [],
        file_refs: [],
      };

      let thrown: ConflictException | undefined;
      try {
        await service.importAll({
          confirm: 'IMPORT',
          data: {
            ...emptyBase,
            tasks: [{ title: 'Legit', evil_column: 'injection' }],
          },
        });
      } catch (err) {
        thrown = err as ConflictException;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('IMPORT_BAD_COLUMN');
    });

    // SCN-1: transaction rolled back — no rows inserted
    it('SCN-1: rolls back the transaction — no rows inserted when bad column present', async () => {
      const emptyBase = {
        settings: [],
        boards: [{ id: 99, name: 'Should rollback', position: 0, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        columns: [],
        notes: [],
        tags: [],
        task_tags: [],
        file_refs: [],
      };

      try {
        await service.importAll({
          confirm: 'IMPORT',
          data: {
            ...emptyBase,
            tasks: [{ title: 'Bad', evil_column: 'x' }],
          },
        });
      } catch {
        // expected
      }

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const boards = await runner.query('SELECT * FROM boards WHERE id = 99');
        expect(boards).toHaveLength(0);
      } finally {
        await runner.release();
      }
    });

    // SCN-2: well-formed payload succeeds
    it('SCN-2: accepts well-formed payload with all valid columns', async () => {
      await seedMinimalData(dataSource);
      const exported = await service.exportAll();

      const result = await service.importAll({ confirm: 'IMPORT', data: exported.data });
      expect(result).toEqual({ imported: true });

      // Verify foreign_keys is ON after import
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const [row] = await runner.query('PRAGMA foreign_keys');
        expect(row.foreign_keys).toBe(1);
      } finally {
        await runner.release();
      }
    });

    it('round-trips a note linked to a task without FK violation (PRAGMA before transaction)', async () => {
      
      await seedMinimalData(dataSource);

      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.query('UPDATE notes SET task_id = 1 WHERE id = 1');
      } finally {
        await runner.release();
      }

      const exported = await service.exportAll();

      expect(exported.data.notes[0]).toMatchObject({ task_id: 1 });

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

  describe('reset — BDD: Reset DB re-triggers onboarding', () => {
    it('clears onboarded_at on settings row after reset', async () => {
      await seedMinimalData(dataSource);

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

// SCN-8: DELETE_ORDER structural integrity — derived from COLUMN_ALLOWLISTS
// These tests are module-level constant checks and require no DataSource.
describe('admin.service — SCN-8: DELETE_ORDER structural integrity', () => {
  it('contains exactly as many entries as COLUMN_ALLOWLISTS has keys', () => {
    expect(DELETE_ORDER.length).toBe(Object.keys(COLUMN_ALLOWLISTS).length);
  });

  it('contains every key from COLUMN_ALLOWLISTS', () => {
    const allowlistKeys = Object.keys(COLUMN_ALLOWLISTS);
    for (const key of allowlistKeys) {
      expect(DELETE_ORDER).toContain(key);
    }
  });

  it('contains no key absent from COLUMN_ALLOWLISTS', () => {
    const allowlistKeys = new Set(Object.keys(COLUMN_ALLOWLISTS));
    for (const entry of DELETE_ORDER) {
      expect(allowlistKeys.has(entry)).toBe(true);
    }
  });

  it('has no duplicate entries', () => {
    const seen = new Set<string>();
    for (const entry of DELETE_ORDER) {
      expect(seen.has(entry)).toBe(false);
      seen.add(entry);
    }
  });
});

// SCN-9: importAll DELETE statements fire in DELETE_ORDER sequence.
// Uses a pure mock DataSource — no real DB connection required.
describe('admin.service — SCN-9: importAll deletes tables in FK-safe DELETE_ORDER sequence', () => {
  it('fires DELETE FROM statements in task_tags → file_refs → notes → tasks → tags → columns → boards → settings order', async () => {
    const deletedTables: string[] = [];

    const mockRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation(async (sql: string) => {
        const match = /^DELETE FROM "([^"]+)"$/.exec(sql.trim());
        if (match) {
          deletedTables.push(match[1]);
        }
        return [];
      }),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };

    const mockDataSource = {
      createQueryRunner: () => mockRunner,
    } as unknown as import('typeorm').DataSource;

    const svc = new AdminService(mockDataSource);

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

    await svc.importAll({ confirm: 'IMPORT', data: emptyData });

    expect(deletedTables).toEqual([...DELETE_ORDER]);
  });
});
