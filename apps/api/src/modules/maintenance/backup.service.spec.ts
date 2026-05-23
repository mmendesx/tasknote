import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

import { BackupService } from './backup.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'tasknote-backup-test-'));
}

async function writeFakeDb(dbPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, 'SQLite format 3\x00fake content');
}

async function setMtime(filePath: string, mtime: Date): Promise<void> {
  await fs.utimes(filePath, mtime, mtime);
}

function ageMs(hours: number): number {
  return Date.now() - hours * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;
let originalDbPathEnv: string | undefined;
let service: BackupService;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  dbPath = path.join(tmpDir, 'tasknote.sqlite');
  await writeFakeDb(dbPath);

  // Point the service at the tmp DB file by overriding the env var.
  originalDbPathEnv = process.env['TASKNOTE_DB_PATH'];
  process.env['TASKNOTE_DB_PATH'] = dbPath;

  service = new BackupService();
});

afterEach(async () => {
  // Restore env before cleanup so other tests are not affected.
  if (originalDbPathEnv === undefined) {
    delete process.env['TASKNOTE_DB_PATH'];
  } else {
    process.env['TASKNOTE_DB_PATH'] = originalDbPathEnv;
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('BackupService.runBackupIfStale()', () => {
  it('creates a backup when the backups directory is empty', async () => {
    const result = await service.runBackupIfStale();

    expect(result.skipped).toBe(false);
    expect(result.backupPath).toBeDefined();
    expect(result.pruned).toHaveLength(0);

    const backupsDir = path.join(path.dirname(dbPath), 'backups');
    const entries = await fs.readdir(backupsDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^tasknote-\d{8}\.sqlite$/);

    // Verify the backup is a copy of the source DB.
    const [sourceContent, backupContent] = await Promise.all([
      fs.readFile(dbPath),
      fs.readFile(result.backupPath as string),
    ]);
    expect(backupContent.equals(sourceContent)).toBe(true);
  });

  it('skips when the newest backup is fresh (mtime within 24 h)', async () => {
    const backupsDir = path.join(path.dirname(dbPath), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });

    // Write a backup file and set its mtime to 1 hour ago (fresh).
    const freshBackupPath = path.join(backupsDir, 'tasknote-20260101.sqlite');
    await fs.writeFile(freshBackupPath, 'backup content');
    await setMtime(freshBackupPath, new Date(ageMs(1)));

    const result = await service.runBackupIfStale();

    expect(result.skipped).toBe(true);
    expect(result.backupPath).toBeUndefined();

    // No new backup should have been created.
    const entries = await fs.readdir(backupsDir);
    expect(entries).toHaveLength(1);
  });

  it('creates a new backup when the newest mtime is >24 h old', async () => {
    const backupsDir = path.join(path.dirname(dbPath), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });

    // Write a backup file and set its mtime to 25 hours ago (stale).
    const staleBackupPath = path.join(backupsDir, 'tasknote-20260101.sqlite');
    await fs.writeFile(staleBackupPath, 'old backup content');
    await setMtime(staleBackupPath, new Date(ageMs(25)));

    const result = await service.runBackupIfStale();

    expect(result.skipped).toBe(false);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).not.toBe(staleBackupPath);

    // Both the old and the new backup should exist (2 total, within the 7 limit).
    const entries = await fs.readdir(backupsDir);
    expect(entries).toHaveLength(2);
    expect(entries.some((e) => e === 'tasknote-20260101.sqlite')).toBe(true);
    expect(entries.some((e) => e.match(/^tasknote-\d{8}\.sqlite$/))).toBe(true);
  });

  it('prunes to 7 when more than 7 backups exist', async () => {
    const backupsDir = path.join(path.dirname(dbPath), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });

    // Create 9 stale backup files with distinct, increasing mtimes.
    // The newest is 26 hours old so that a new backup will also be created,
    // bringing the total to 10 before pruning — leaving exactly 7 after.
    for (let i = 9; i >= 1; i--) {
      const filename = `tasknote-2026010${i}.sqlite`;
      const filePath = path.join(backupsDir, filename);
      await fs.writeFile(filePath, `backup ${i}`);
      // Assign staggered mtimes: oldest = now - (26 + 9) h, newest = now - (26 + 1) h
      await setMtime(filePath, new Date(ageMs(26 + i)));
    }

    const result = await service.runBackupIfStale();

    expect(result.skipped).toBe(false);

    const entries = await fs.readdir(backupsDir);
    expect(entries).toHaveLength(7);

    // Pruned list must contain 3 entries (9 existing + 1 new = 10; 10 - 7 = 3).
    expect(result.pruned).toHaveLength(3);

    // All pruned paths must no longer exist on disk.
    for (const prunedPath of result.pruned) {
      await expect(fs.access(prunedPath)).rejects.toThrow();
    }
  });
});
