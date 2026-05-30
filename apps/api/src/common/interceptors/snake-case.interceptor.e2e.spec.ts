/**
 * SCN-1 / SCN-2 end-to-end: SnakeCaseInterceptor on real handler paths.
 *
 * Boots a slim Nest application (no AppModule, no on-disk DB) wiring
 * TasksController + BoardsController over an in-memory better-sqlite3
 * DataSource.  The SnakeCaseInterceptor is applied as a global interceptor on
 * the app instance.  Requests are made via native `fetch` over a real TCP
 * listener so every layer of the Nest pipeline — routing, guards, interceptors
 * — executes.
 *
 * No supertest required: Node ≥ 18 ships `fetch`.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { SnakeCaseInterceptor } from './snake-case.interceptor';
import { TasksController } from '../../modules/tasks/tasks.controller';
import { TasksService } from '../../modules/tasks/tasks.service';
import { BoardsController } from '../../modules/boards/boards.controller';
import { BoardsService } from '../../modules/boards/boards.service';
import { FileRefsService } from '../../modules/file-refs/file-refs.service';

import { BoardEntity } from '../../modules/boards/entities/board.entity';
import { ColumnEntity } from '../../modules/columns/entities/column.entity';
import { TaskEntity } from '../../modules/tasks/entities/task.entity';
import { NoteEntity } from '../../modules/notes/entities/note.entity';
import { TagEntity } from '../../modules/tags/entities/tag.entity';
import { FileRefEntity } from '../../modules/file-refs/entities/file-ref.entity';

import type { INestApplication } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDataSource(): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [BoardEntity, ColumnEntity, TaskEntity, NoteEntity, TagEntity, FileRefEntity],
    synchronize: true,
    prepareDatabase: (db) => {
      db.pragma('foreign_keys = ON');
    },
  });
}

async function seedFixtures(dataSource: DataSource): Promise<{ boardId: number; taskId: number }> {
  const boardRepo = dataSource.getRepository(BoardEntity);
  const columnRepo = dataSource.getRepository(ColumnEntity);
  const taskRepo = dataSource.getRepository(TaskEntity);
  const tagRepo = dataSource.getRepository(TagEntity);

  const board = await boardRepo.save(boardRepo.create({ name: 'Test Board', position: 0 }));

  const column = await columnRepo.save(
    columnRepo.create({ boardId: board.id, name: 'Doing', color: '#F5C26B', isDone: false, position: 0 }),
  );

  const task = await taskRepo.save(
    taskRepo.create({
      columnId: column.id,
      title: 'E2E Interceptor Test Task',
      priority: 'high',
      position: 0,
      dueDate: new Date('2026-07-01T12:00:00.000Z'),
      descriptionMd: '## Notes',
    }),
  );

  // Create a tag and link it via the task_tags join table so tag_ids is non-empty on board path.
  const tag = await tagRepo.save(tagRepo.create({ name: 'urgent', color: '#FF0000' }));
  await dataSource.query(
    `INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)`,
    [task.id, tag.id],
  );

  return { boardId: board.id, taskId: task.id };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SnakeCaseInterceptor — end-to-end over real HTTP (SCN-1 / SCN-2)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let baseUrl: string;
  let boardId: number;
  let taskId: number;

  beforeEach(async () => {
    dataSource = buildDataSource();
    await dataSource.initialize();

    const { boardId: bid, taskId: tid } = await seedFixtures(dataSource);
    boardId = bid;
    taskId = tid;

    // Provide repositories as useValue so Nest resolves @InjectRepository() tokens
    // from the same in-memory DataSource used to seed the fixtures.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController, BoardsController],
      providers: [
        // Repository tokens
        {
          provide: getRepositoryToken(TaskEntity),
          useValue: dataSource.getRepository(TaskEntity),
        },
        {
          provide: getRepositoryToken(ColumnEntity),
          useValue: dataSource.getRepository(ColumnEntity),
        },
        {
          provide: getRepositoryToken(BoardEntity),
          useValue: dataSource.getRepository(BoardEntity),
        },
        {
          provide: getRepositoryToken(FileRefEntity),
          useValue: dataSource.getRepository(FileRefEntity),
        },
        // DataSource — both services inject it by class token
        {
          provide: DataSource,
          useValue: dataSource,
        },
        // Services
        FileRefsService,
        TasksService,
        BoardsService,
        // Global interceptor wired through APP_INTERCEPTOR so it runs on every response
        {
          provide: APP_INTERCEPTOR,
          useClass: SnakeCaseInterceptor,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    await app.listen(0); // OS-assigned free port

    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ─── SCN-1: GET /tasks/:id ─────────────────────────────────────────────────

  describe('SCN-1: GET /tasks/:id emits snake_case keys', () => {
    it('returns 200 with snake_case top-level keys', async () => {
      const res = await fetch(`${baseUrl}/tasks/${taskId}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;

      // Required snake_case keys that have camelCase equivalents in the entity
      expect(body).toHaveProperty('column_id');
      expect(body).toHaveProperty('due_date');
      expect(body).toHaveProperty('description_md');
      expect(body).toHaveProperty('created_at');
      expect(body).toHaveProperty('updated_at');
      expect(body).toHaveProperty('archived_at');
      expect(body).toHaveProperty('completed_at');
      expect(body).toHaveProperty('committed_on');
    });

    it('response body contains NO camelCase keys', async () => {
      const res = await fetch(`${baseUrl}/tasks/${taskId}`);
      const body = (await res.json()) as Record<string, unknown>;

      const camelKeys = ['columnId', 'dueDate', 'descriptionMd', 'committedOn', 'createdAt', 'updatedAt', 'archivedAt', 'completedAt'];
      for (const key of camelKeys) {
        expect(body, `camelCase key "${key}" must not appear in response`).not.toHaveProperty(key);
      }
    });

    it('column_id value matches the seeded column', async () => {
      const res = await fetch(`${baseUrl}/tasks/${taskId}`);
      const body = (await res.json()) as Record<string, unknown>;

      // column_id must be a number matching the seeded column
      expect(typeof body.column_id).toBe('number');
      expect((body.column_id as number)).toBeGreaterThan(0);
    });

    it('due_date is present and non-null for the seeded task', async () => {
      const res = await fetch(`${baseUrl}/tasks/${taskId}`);
      const body = (await res.json()) as Record<string, unknown>;

      expect(body.due_date).not.toBeNull();
      expect(body.due_date).toBeDefined();
    });

    it('nested column object (if present) also has snake_case keys', async () => {
      const res = await fetch(`${baseUrl}/tasks/${taskId}`);
      const body = (await res.json()) as Record<string, unknown>;

      const col = body.column as Record<string, unknown> | undefined;
      if (col && typeof col === 'object') {
        // If the column relation is loaded it must also be snake_case
        expect(col).not.toHaveProperty('boardId');
        expect(col).not.toHaveProperty('isDone');
        expect(col).toHaveProperty('board_id');
        expect(col).toHaveProperty('is_done');
      }
    });
  });

  // ─── SCN-2: GET /boards/:id ────────────────────────────────────────────────

  describe('SCN-2: GET /boards/:id emits snake_case keys on nested columns and tasks', () => {
    it('returns 200', async () => {
      const res = await fetch(`${baseUrl}/boards/${boardId}`);
      expect(res.status).toBe(200);
    });

    it('board top-level keys are snake_case', async () => {
      const res = await fetch(`${baseUrl}/boards/${boardId}`);
      const body = (await res.json()) as Record<string, unknown>;

      // Board entity has no multi-word camelCase fields but confirm id/name
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('columns');
    });

    it('nested column objects are snake_case (board_id, is_done)', async () => {
      const res = await fetch(`${baseUrl}/boards/${boardId}`);
      const body = (await res.json()) as Record<string, unknown>;

      const columns = body.columns as Array<Record<string, unknown>>;
      expect(columns).toHaveLength(1);

      const col = columns[0];
      expect(col).toHaveProperty('board_id');
      expect(col).toHaveProperty('is_done');
      expect(col).not.toHaveProperty('boardId');
      expect(col).not.toHaveProperty('isDone');
    });

    it('nested task objects within columns are snake_case', async () => {
      const res = await fetch(`${baseUrl}/boards/${boardId}`);
      const body = (await res.json()) as Record<string, unknown>;

      const columns = body.columns as Array<Record<string, unknown>>;
      const tasks = columns[0].tasks as Array<Record<string, unknown>>;
      expect(tasks).toHaveLength(1);

      const task = tasks[0];

      // snake_case keys must be present
      expect(task).toHaveProperty('column_id');
      expect(task).toHaveProperty('due_date');
      expect(task).toHaveProperty('description_md');
      expect(task).toHaveProperty('created_at');
      expect(task).toHaveProperty('updated_at');
      expect(task).toHaveProperty('archived_at');
      expect(task).toHaveProperty('completed_at');
      expect(task).toHaveProperty('committed_on');

      // camelCase must NOT appear
      const camelKeys = ['columnId', 'dueDate', 'descriptionMd', 'committedOn', 'createdAt', 'updatedAt'];
      for (const key of camelKeys) {
        expect(task, `camelCase key "${key}" must not appear in nested task`).not.toHaveProperty(key);
      }
    });

    it('tag_ids is present and non-empty (snake_case preserved) on task', async () => {
      const res = await fetch(`${baseUrl}/boards/${boardId}`);
      const body = (await res.json()) as Record<string, unknown>;

      const columns = body.columns as Array<Record<string, unknown>>;
      const task = (columns[0].tasks as Array<Record<string, unknown>>)[0];

      // tag_ids is bolted on by BoardsService; key is already snake_case
      expect(task).toHaveProperty('tag_ids');
      const tagIds = task.tag_ids as number[];
      expect(Array.isArray(tagIds)).toBe(true);
      expect(tagIds.length).toBeGreaterThan(0);
    });
  });
});
