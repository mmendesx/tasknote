import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { COLUMN_ALLOWLISTS, DELETE_ORDER } from './admin.constants';

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

// Re-export constants so consumers can import from either admin.service or admin.constants.
export { COLUMN_ALLOWLISTS, DELETE_ORDER } from './admin.constants';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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

  async importAll(body: unknown): Promise<{ imported: true }> {
    
    if (
      typeof body !== 'object' ||
      body === null ||
      (body as Record<string, unknown>)['confirm'] !== 'IMPORT'
    ) {
      this.logger.warn('importAll: missing or incorrect confirm value');
      throw new BadRequestException({ code: 'CONFIRM_REQUIRED', message: "confirm 'IMPORT' is required" });
    }

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

    await runner.query('PRAGMA foreign_keys = OFF');
    await runner.startTransaction();

    try {
      
      for (const tbl of DELETE_ORDER) {
        await runner.query(`DELETE FROM "${tbl}"`);
      }

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
      
      try {
        await runner.query('PRAGMA foreign_keys = ON');
      } catch {
        
      }
      await runner.release();
    }

    return { imported: true };
  }

  async reset(body?: unknown): Promise<{ reset: true }> {
    
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

    await runner.query('PRAGMA foreign_keys = OFF');
    await runner.startTransaction();

    try {
      // settings is intentionally excluded: the row is preserved and cleared via UPDATE below.
      for (const tbl of DELETE_ORDER.filter((t) => t !== 'settings')) {
        await runner.query(`DELETE FROM "${tbl}"`);
      }

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
        
      }
      await runner.release();
    }

    return { reset: true };
  }

  private async insertRows(
    runner: import('typeorm').QueryRunner,
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const allowed = COLUMN_ALLOWLISTS[table as keyof typeof COLUMN_ALLOWLISTS];
    if (allowed) {
      for (const row of rows) {
        const unknown = Object.keys(row).filter((k) => !allowed.has(k));
        if (unknown.length > 0) {
          throw new ConflictException({
            code: 'IMPORT_BAD_COLUMN',
            message: `Unknown column(s) in table "${table}": ${unknown.join(', ')}`,
          });
        }
      }
    }

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
