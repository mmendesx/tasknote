import 'reflect-metadata';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';

/**
 * Resolves the SQLite database path from the environment or the default location.
 * Exported for use in app.module.ts and health.controller.ts so the path logic
 * lives in exactly one place.
 */
export function resolveDbPath(): string {
  return (
    process.env['TASKNOTE_DB_PATH'] ??
    path.join(os.homedir(), '.tasknote', 'tasknote.sqlite')
  );
}

/**
 * Creates the parent directory for the given file path if it doesn't exist.
 * Safe to call multiple times (mkdirSync with recursive:true is idempotent).
 */
export function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
}

// Top-level evaluation so that `dbPath` exported below is always the resolved value
// and the directory is created before the TypeORM DataSource is used from CLI scripts.
const dbPath = resolveDbPath();
ensureDbDirectory(dbPath);

const dataSourceOptions: BetterSqlite3ConnectionOptions = {
  type: 'better-sqlite3',
  database: dbPath,
  entities: [
    'dist/**/*.entity.js',
    'src/**/*.entity.ts',
  ],
  migrations: [
    'dist/database/migrations/*.js',
    'src/database/migrations/*.ts',
  ],
  migrationsRun: true,
  synchronize: false,
  // WAL mode + foreign keys enabled via prepareDatabase callback.
  // This runs before any TypeORM statement, which is required for PRAGMA journal_mode.
  prepareDatabase: (db: import('better-sqlite3').Database) => {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  },
};

export const AppDataSource = new DataSource(dataSourceOptions);

// Re-export the resolved path for use in HealthController
export { dbPath };
