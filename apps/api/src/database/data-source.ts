import 'reflect-metadata';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';

export function resolveDbPath(): string {
  return (
    process.env['TASKNOTE_DB_PATH'] ??
    path.join(os.homedir(), '.tasknote', 'tasknote.sqlite')
  );
}

export function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
}

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
  
  prepareDatabase: (db: import('better-sqlite3').Database) => {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  },
};

export const AppDataSource = new DataSource(dataSourceOptions);

export { dbPath };
