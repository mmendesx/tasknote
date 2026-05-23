import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';

// ─── Export payload shape ────────────────────────────────────────────────────

export interface ExportPayload {
  version: '1.0';
  exported_at: string;
  data: {
    settings: Record<string, unknown>[];
    boards: Record<string, unknown>[];
    columns: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    tags: Record<string, unknown>[];
    task_tags: Record<string, unknown>[];
    file_refs: Record<string, unknown>[];
  };
}

// ─── Import Zod schema ───────────────────────────────────────────────────────

const TableArraySchema = z.array(z.record(z.unknown()));

const ImportDataSchema = z.object({
  settings: TableArraySchema,
  boards: TableArraySchema,
  columns: TableArraySchema,
  tasks: TableArraySchema,
  notes: TableArraySchema,
  tags: TableArraySchema,
  task_tags: TableArraySchema,
  file_refs: TableArraySchema,
});

export const ImportBodySchema = z.object({
  confirm: z.literal('IMPORT', {
    errorMap: () => ({ message: "confirm must be the string 'IMPORT'" }),
  }),
  data: ImportDataSchema,
});

export type ImportBodyDto = z.infer<typeof ImportBodySchema>;

export const ResetBodySchema = z.object({
  confirm: z.literal('RESET', {
    errorMap: () => ({ message: "confirm must be the string 'RESET'" }),
  }),
});

export type ResetBodyDto = z.infer<typeof ResetBodySchema>;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Reads every table and returns a structured JSON payload.
   * For MVP single-user dataset this is safe to hold in memory.
   */
  async exportAll(): Promise<ExportPayload> {
    this.logger.log('exportAll: reading all tables');

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      const [settings, boards, columns, tasks, notes, tags, task_tags, file_refs] =
        await Promise.all([
          runner.query('SELECT * FROM settings'),
          runner.query('SELECT * FROM boards'),
          runner.query('SELECT * FROM columns'),
          runner.query('SELECT * FROM tasks'),
          runner.query('SELECT * FROM notes'),
          runner.query('SELECT * FROM tags'),
          runner.query('SELECT * FROM task_tags'),
          runner.query('SELECT * FROM file_refs'),
        ]);

      this.logger.log(
        `exportAll: settings=${settings.length} boards=${boards.length} columns=${columns.length} ` +
          `tasks=${tasks.length} notes=${notes.length} tags=${tags.length} ` +
          `task_tags=${task_tags.length} file_refs=${file_refs.length}`,
      );

      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        data: { settings, boards, columns, tasks, notes, tags, task_tags, file_refs },
      };
    } finally {
      await runner.release();
    }
  }

  /**
   * Validates shape via Zod, then replaces all table data inside a transaction.
   * FK constraints are disabled BEFORE starting the transaction — SQLite silently
   * ignores PRAGMA foreign_keys inside an active transaction, so the PRAGMA must
   * precede BEGIN.
   *
   * Delete order (FK-safe, children first):
   *   file_refs → task_tags → tasks → columns → notes → tags → boards → settings
   *
   * Insert order (parents first):
   *   settings → boards → tags → notes → columns → tasks → task_tags → file_refs
   */
  async importAll(body: unknown): Promise<{ imported: true }> {
    // 1. Validate confirm field independently so we can return the right error code
    if (
      typeof body !== 'object' ||
      body === null ||
      (body as Record<string, unknown>)['confirm'] !== 'IMPORT'
    ) {
      this.logger.warn('importAll: missing or incorrect confirm value');
      throw new BadRequestException({ code: 'CONFIRM_REQUIRED', message: "confirm 'IMPORT' is required" });
    }

    // 2. Full Zod validation of the import shape
    const parsed = ImportBodySchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn('importAll: payload shape invalid', { issues: parsed.error.issues });
      throw new BadRequestException({
        code: 'INVALID_IMPORT_PAYLOAD',
        message: 'Import payload failed validation',
        details: parsed.error.issues,
      });
    }

    const { data } = parsed.data;

    this.logger.log(
      `importAll: replacing DB contents — ` +
        `settings=${data.settings.length} boards=${data.boards.length} tasks=${data.tasks.length}`,
    );

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    // Disable FK checks BEFORE the transaction — SQLite ignores this PRAGMA
    // when issued inside an already-active transaction.
    await runner.query('PRAGMA foreign_keys = OFF');
    await runner.startTransaction();

    try {
      // Wipe: children before parents
      for (const table of ['file_refs', 'task_tags', 'tasks', 'columns', 'notes', 'tags', 'boards', 'settings']) {
        await runner.query(`DELETE FROM "${table}"`);
      }

      // Insert: parents before children
      await this.insertRows(runner, 'settings', data.settings);
      await this.insertRows(runner, 'boards', data.boards);
      await this.insertRows(runner, 'tags', data.tags);
      await this.insertRows(runner, 'notes', data.notes);
      await this.insertRows(runner, 'columns', data.columns);
      await this.insertRows(runner, 'tasks', data.tasks);
      await this.insertRows(runner, 'task_tags', data.task_tags);
      await this.insertRows(runner, 'file_refs', data.file_refs);

      await runner.commitTransaction();
      this.logger.log('importAll: transaction committed successfully');
    } catch (err) {
      await runner.rollbackTransaction();
      this.logger.error('importAll: transaction rolled back', (err as Error).stack);
      throw err;
    } finally {
      // Re-enable FK checks and release regardless of outcome
      try {
        await runner.query('PRAGMA foreign_keys = ON');
      } catch {
        // Best-effort — connection may have died on rollback
      }
      await runner.release();
    }

    return { imported: true };
  }

  /**
   * Wipes all user data tables and clears onboarded_at on the settings row
   * so onboarding re-triggers on next app load. The settings row is preserved
   * (avoids FK orphan issues with default_board_id), just nulled out.
   *
   * Confirm guard is enforced here (same layer as importAll) so unit tests
   * can exercise the error path without going through the controller.
   *
   * Wipe order: file_refs → task_tags → tasks → columns → notes → tags → boards
   * Settings row is UPDATEd, not deleted.
   */
  async reset(body?: unknown): Promise<{ reset: true }> {
    // Confirm guard — same pattern as importAll
    if (
      typeof body !== 'object' ||
      body === null ||
      (body as Record<string, unknown>)['confirm'] !== 'RESET'
    ) {
      this.logger.warn('reset: missing or incorrect confirm value');
      throw new BadRequestException({ code: 'CONFIRM_REQUIRED', message: "confirm 'RESET' is required" });
    }

    this.logger.log('reset: wiping all user data and clearing onboarded_at');

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    // Disable FK checks BEFORE the transaction — SQLite ignores this PRAGMA
    // when issued inside an already-active transaction.
    await runner.query('PRAGMA foreign_keys = OFF');
    await runner.startTransaction();

    try {
      for (const table of ['file_refs', 'task_tags', 'tasks', 'columns', 'notes', 'tags', 'boards']) {
        await runner.query(`DELETE FROM "${table}"`);
      }

      // Reset settings row — preserve the row, just null out user-specific fields
      await runner.query(
        `UPDATE settings SET onboarded_at = NULL, display_name = '', default_board_id = NULL WHERE id = 1`,
      );

      await runner.commitTransaction();
      this.logger.log('reset: transaction committed — onboarding will re-trigger on next load');
    } catch (err) {
      await runner.rollbackTransaction();
      this.logger.error('reset: transaction rolled back', (err as Error).stack);
      throw err;
    } finally {
      try {
        await runner.query('PRAGMA foreign_keys = ON');
      } catch {
        // Best-effort — connection may have died on rollback
      }
      await runner.release();
    }

    return { reset: true };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Bulk-inserts rows into a table using raw SQL.
   * Each row is inserted individually to preserve exact column set from export.
   * No-ops silently when the array is empty.
   */
  private async insertRows(
    runner: import('typeorm').QueryRunner,
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    if (rows.length === 0) return;

    for (const row of rows) {
      const columns = Object.keys(row)
        .map((c) => `"${c}"`)
        .join(', ');
      const placeholders = Object.keys(row)
        .map(() => '?')
        .join(', ');
      const values = Object.values(row);

      await runner.query(
        `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
        values,
      );
    }
  }
}
