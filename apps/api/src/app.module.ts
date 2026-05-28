import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HealthController } from './health.controller';
import { resolveDbPath, ensureDbDirectory } from './database/data-source';

import { SettingsModule } from './modules/settings/settings.module';
import { BoardsModule } from './modules/boards/boards.module';
import { ColumnsModule } from './modules/columns/columns.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { TagsModule } from './modules/tags/tags.module';
import { FileRefsModule } from './modules/file-refs/file-refs.module';
import { SearchModule } from './modules/search/search.module';
import { AdminModule } from './modules/admin/admin.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

import { SettingsEntity } from './modules/settings/entities/settings.entity';
import { BoardEntity } from './modules/boards/entities/board.entity';
import { ColumnEntity } from './modules/columns/entities/column.entity';
import { TaskEntity } from './modules/tasks/entities/task.entity';
import { NoteEntity } from './modules/notes/entities/note.entity';
import { TagEntity } from './modules/tags/entities/tag.entity';
import { FileRefEntity } from './modules/file-refs/entities/file-ref.entity';

import { Initial1700000000000 } from './database/migrations/1700000000000-Initial';
import { AddCommittedOn1700000000001 } from './database/migrations/1700000000001-AddCommittedOn';

import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';

@Module({
  imports: [
    
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      useFactory: (): BetterSqlite3ConnectionOptions => {
        
        const dbPath = resolveDbPath();
        ensureDbDirectory(dbPath);

        return {
          type: 'better-sqlite3',
          database: dbPath,
          entities: [
            SettingsEntity,
            BoardEntity,
            ColumnEntity,
            TaskEntity,
            NoteEntity,
            TagEntity,
            FileRefEntity,
          ],
          migrations: [Initial1700000000000, AddCommittedOn1700000000001],
          migrationsRun: true,
          synchronize: false,
          
          prepareDatabase: (db: import('better-sqlite3').Database) => {
            db.pragma('journal_mode = WAL');
            db.pragma('foreign_keys = ON');
          },
        };
      },
    }),

    SettingsModule,
    BoardsModule,
    ColumnsModule,
    TasksModule,
    NotesModule,
    TagsModule,
    FileRefsModule,
    SearchModule,
    AdminModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
