
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as childProcess from 'child_process';
import { FileRefEntity } from './entities/file-ref.entity';
import { FileRefsService } from './file-refs.service';

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [FileRefEntity],
    synchronize: true,
  });
}

function buildService(repo: Repository<FileRefEntity>): FileRefsService {
  return new FileRefsService(repo);
}

describe('FileRefsService', () => {
  let dataSource: DataSource;
  let repo: Repository<FileRefEntity>;
  let service: FileRefsService;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();
    repo = dataSource.getRepository(FileRefEntity);
    service = buildService(repo);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('validatePath', () => {
    it('accepts a POSIX absolute path', () => {
      expect(() => service.validatePath('/Users/me/docs/spec.pdf')).not.toThrow();
    });

    it('accepts a Windows absolute path', () => {
      expect(() => service.validatePath('C:\\Users\\me\\spec.pdf')).not.toThrow();
    });

    it('rejects a relative path ./foo with 400 INVALID_PATH', () => {
      expect(() => service.validatePath('./foo')).toThrow(BadRequestException);
      try {
        service.validatePath('./foo');
      } catch (err) {
        const e = err as BadRequestException;
        const response = e.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_PATH');
      }
    });

    it('rejects a bare relative path foo/bar with 400 INVALID_PATH', () => {
      let caught: BadRequestException | undefined;
      try {
        service.validatePath('foo/bar');
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });

    it.each([
      [';', '/tmp/file;rm -rf /'],
      ['|', '/tmp/file|cat /etc/passwd'],
      ['&', '/tmp/file&'],
      ['`', '/tmp/file`id`'],
      ['$(', '/tmp/file$(id)'],
      ['newline', '/tmp/file\nmalicious'],
    ])('rejects path containing %s with 400 INVALID_PATH', (_label, badPath) => {
      let caught: BadRequestException | undefined;
      try {
        service.validatePath(badPath);
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });
  });

  describe('createFileRef — BDD: Add a file reference by path', () => {
    it('creates a ref with valid absolute path and persists it', async () => {
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/Users/me/docs/spec.pdf',
        label: 'Spec',
        note: null,
      });

      expect(ref.id).toBeGreaterThan(0);
      expect(ref.targetType).toBe('task');
      expect(ref.targetId).toBe(1);
      expect(ref.path).toBe('/Users/me/docs/spec.pdf');
      expect(ref.label).toBe('Spec');
    });

    it('throws 400 INVALID_PATH when path contains ";"', async () => {
      let caught: BadRequestException | undefined;
      try {
        await service.createFileRef({
          target_type: 'task',
          target_id: 1,
          path: '/tmp/file;rm -rf /',
          label: 'Bad',
        });
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });

    it.each([
      ['$(', '/tmp/file$(id)'],
      ['|', '/tmp/file|cat /etc/passwd'],
      ['&', '/tmp/file&malicious'],
      ['`', '/tmp/file`id`'],
      ['newline', '/tmp/file\nbad'],
    ])('throws 400 INVALID_PATH for path containing %s', async (_label, badPath) => {
      let caught: BadRequestException | undefined;
      try {
        await service.createFileRef({
          target_type: 'task',
          target_id: 1,
          path: badPath,
          label: 'Bad',
        });
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });

    it('throws 400 INVALID_PATH for relative path "./foo"', async () => {
      let caught: BadRequestException | undefined;
      try {
        await service.createFileRef({
          target_type: 'task',
          target_id: 1,
          path: './foo',
          label: 'Relative',
        });
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });
  });

  describe('updateFileRef', () => {
    it('updates the label without touching path', async () => {
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/tmp/doc.pdf',
        label: 'Old Label',
      });

      const updated = await service.updateFileRef(ref.id, { label: 'New Label' });
      expect(updated.label).toBe('New Label');
      expect(updated.path).toBe('/tmp/doc.pdf');
    });

    it('re-validates path when path is updated — rejects metacharacter', async () => {
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/tmp/doc.pdf',
        label: 'Doc',
      });

      let caught: BadRequestException | undefined;
      try {
        await service.updateFileRef(ref.id, { path: '/tmp/file;bad' });
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_PATH');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.updateFileRef(9999, { label: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeFileRef', () => {
    it('deletes an existing ref', async () => {
      const ref = await service.createFileRef({
        target_type: 'note',
        target_id: 5,
        path: '/tmp/notes.md',
        label: 'Notes',
      });

      await service.removeFileRef(ref.id);
      const remaining = await repo.findOne({ where: { id: ref.id } });
      expect(remaining).toBeNull();
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.removeFileRef(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exists', () => {
    it('returns { exists: true } for /etc/hosts which is always present on POSIX', async () => {
      
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/etc/hosts',
        label: 'Hosts',
      });

      const result = await service.exists(ref.id);
      expect(result).toEqual({ exists: true });
    });

    it('returns { exists: false } for a non-existent path', async () => {
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/tmp/__nonexistent_tasknote_test__',
        label: 'Gone',
      });

      const result = await service.exists(ref.id);
      expect(result).toEqual({ exists: false });
    });

    it('throws NotFoundException when file ref id is unknown', async () => {
      await expect(service.exists(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('openFile', () => {
    it('invokes spawn with the correct platform binary and no shell option', async () => {
      const ref = await service.createFileRef({
        target_type: 'task',
        target_id: 1,
        path: '/tmp/test-open.pdf',
        label: 'Test',
      });

      const fakeChild = {
        unref: vi.fn(),
      };
      const spawnSpy = vi
        .spyOn(childProcess, 'spawn')
        .mockReturnValue(fakeChild as unknown as ReturnType<typeof childProcess.spawn>);

      const result = await service.openFile(ref.id);

      expect(result).toEqual({ opened: true });
      expect(spawnSpy).toHaveBeenCalledOnce();

      const [cmd, args, opts] = spawnSpy.mock.calls[0] as [
        string,
        string[],
        childProcess.SpawnOptions,
      ];

      const expectedOpener = { darwin: 'open', linux: 'xdg-open', win32: 'explorer.exe' }[
        process.platform
      ];
      if (expectedOpener) {
        expect(cmd).toBe(expectedOpener);
      }

      expect(args).toEqual(['/tmp/test-open.pdf']);

      expect(opts?.shell).toBeFalsy();

      expect(opts?.detached).toBe(true);
      expect(opts?.stdio).toBe('ignore');
      expect(fakeChild.unref).toHaveBeenCalledOnce();
    });

    it('throws NotFoundException when file ref id is unknown', async () => {
      await expect(service.openFile(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllForBatch — ICT-52 (SCN-6, SCN-7)', () => {
    it('SCN-6: issues a single DELETE with IN clause for [1,2,3]', async () => {
      // Mock the query builder chain so we can assert the WHERE clause was built
      // with parameterized IN — without depending on SQLite dialect quirks.
      const executeMock = vi.fn().mockResolvedValue(undefined);
      const whereMock = vi.fn().mockReturnValue({ execute: executeMock });
      const deleteMock = vi.fn().mockReturnValue({ where: whereMock });
      const createQueryBuilderMock = vi.fn().mockReturnValue({ delete: deleteMock });

      vi.spyOn(repo, 'createQueryBuilder').mockImplementation(createQueryBuilderMock);

      await service.deleteAllForBatch('task', [1, 2, 3]);

      expect(createQueryBuilderMock).toHaveBeenCalledOnce();
      expect(deleteMock).toHaveBeenCalledOnce();
      expect(whereMock).toHaveBeenCalledOnce();

      const [whereClause, params] = whereMock.mock.calls[0] as [string, Record<string, unknown>];
      expect(whereClause).toContain(':...targetIds');
      expect(params).toMatchObject({ targetType: 'task', targetIds: [1, 2, 3] });

      expect(executeMock).toHaveBeenCalledOnce();
    });

    it('SCN-7: returns immediately without issuing SQL when targetIds is empty', async () => {
      const createQueryBuilderMock = vi.fn();
      vi.spyOn(repo, 'createQueryBuilder').mockImplementation(createQueryBuilderMock);

      await service.deleteAllForBatch('task', []);

      expect(createQueryBuilderMock).not.toHaveBeenCalled();
    });
  });

  describe('listFileRefs', () => {
    it('returns only refs for the given target_type + target_id', async () => {
      await service.createFileRef({
        target_type: 'task',
        target_id: 10,
        path: '/tmp/a.pdf',
        label: 'A',
      });
      await service.createFileRef({
        target_type: 'task',
        target_id: 10,
        path: '/tmp/b.pdf',
        label: 'B',
      });
      await service.createFileRef({
        target_type: 'note',
        target_id: 10,
        path: '/tmp/c.pdf',
        label: 'C',
      });

      const refs = await service.listFileRefs('task', 10);
      expect(refs).toHaveLength(2);
      expect(refs.every((r) => r.targetType === 'task' && r.targetId === 10)).toBe(true);
    });

    it('returns empty array when no refs match', async () => {
      const refs = await service.listFileRefs('task', 9999);
      expect(refs).toEqual([]);
    });

    it('throws 400 INVALID_TARGET_TYPE when target_type is omitted (undefined)', async () => {
      
      let caught: BadRequestException | undefined;
      try {
        await service.listFileRefs(undefined as unknown as string, 1);
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_TARGET_TYPE');
    });

    it('throws 400 INVALID_TARGET_TYPE when target_type is not a known value', async () => {
      let caught: BadRequestException | undefined;
      try {
        await service.listFileRefs('board', 1);
      } catch (err) {
        caught = err as BadRequestException;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { code: string };
      expect(response.code).toBe('INVALID_TARGET_TYPE');
    });
  });
});
