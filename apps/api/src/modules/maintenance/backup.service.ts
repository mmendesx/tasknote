import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

import { resolveDbPath } from '../../database/data-source';

const BACKUP_FILE_PATTERN = /^tasknote-\d{8}\.sqlite$/;
const MAX_BACKUPS = 7;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface BackupResult {
  skipped: boolean;
  backupPath?: string;
  pruned: string[];
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.runBackupIfStale();
      if (result.skipped) {
        this.logger.log('Backup skipped — most recent backup is fresh (< 24h old)');
      } else {
        this.logger.log(`Backup created: ${result.backupPath}`);
      }
      if (result.pruned.length > 0) {
        this.logger.log(`Pruned ${result.pruned.length} old backup(s): ${result.pruned.join(', ')}`);
      }
    } catch (err) {
      // Backup failures must never block app startup. Log the error and continue.
      this.logger.error('Backup-on-startup failed — app continues normally', err instanceof Error ? err.stack : String(err));
    }
  }

  async runBackupIfStale(): Promise<BackupResult> {
    const dbPath = resolveDbPath();
    const backupsDir = path.join(path.dirname(dbPath), 'backups');

    await fs.mkdir(backupsDir, { recursive: true });

    const backupFiles = await this.listBackupFiles(backupsDir);

    const newest = backupFiles.length > 0 ? backupFiles[backupFiles.length - 1] : null;
    const now = Date.now();
    const isStale = newest === null || now - newest.mtime > TWENTY_FOUR_HOURS_MS;

    let backupPath: string | undefined;

    if (isStale) {
      const filename = `tasknote-${formatDateYYYYMMDD(new Date())}.sqlite`;
      backupPath = path.join(backupsDir, filename);

      // Plain copyFile is intentional here: this service does not hold the
      // better-sqlite3 connection, so we cannot use the db.backup() API.
      // WAL mode guarantees atomic reads at the file level, so a copyFile
      // snapshot is safe enough for a single-user local app backup.
      await fs.copyFile(dbPath, backupPath);

      this.logger.debug(`Copied DB to backup: ${backupPath}`);
    }

    // Re-list after potential copy so the new file is included in pruning.
    const filesAfterCopy = await this.listBackupFiles(backupsDir);
    const pruned = await this.pruneOldBackups(backupsDir, filesAfterCopy);

    return { skipped: !isStale, backupPath, pruned };
  }

  private async listBackupFiles(
    backupsDir: string,
  ): Promise<Array<{ name: string; mtime: number }>> {
    const entries = await fs.readdir(backupsDir);
    const backupNames = entries.filter((name) => BACKUP_FILE_PATTERN.test(name));

    const withStats = await Promise.all(
      backupNames.map(async (name) => {
        const stat = await fs.stat(path.join(backupsDir, name));
        return { name, mtime: stat.mtimeMs };
      }),
    );

    // Sort oldest → newest so caller can pop the newest from the end.
    withStats.sort((a, b) => a.mtime - b.mtime);
    return withStats;
  }

  private async pruneOldBackups(
    backupsDir: string,
    files: Array<{ name: string; mtime: number }>,
  ): Promise<string[]> {
    if (files.length <= MAX_BACKUPS) {
      return [];
    }

    // Files are sorted oldest → newest; keep the last MAX_BACKUPS entries.
    const toDelete = files.slice(0, files.length - MAX_BACKUPS);

    await Promise.all(
      toDelete.map(({ name }) => fs.unlink(path.join(backupsDir, name))),
    );

    return toDelete.map(({ name }) => path.join(backupsDir, name));
  }
}

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
