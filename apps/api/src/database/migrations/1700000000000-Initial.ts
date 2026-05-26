import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1700000000000 implements MigrationInterface {
  name = 'Initial1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "settings" (
        "id"               INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
        "display_name"     TEXT    NOT NULL DEFAULT '',
        "theme"            TEXT    NOT NULL DEFAULT 'dark',
        "accent"           TEXT    NOT NULL DEFAULT '#A3E635',
        "default_board_id" INTEGER,
        "onboarded_at"     DATETIME,
        "timezone"         TEXT    NOT NULL DEFAULT 'UTC',
        CHECK ("id" = 1)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "boards" (
        "id"         INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name"       TEXT    NOT NULL,
        "position"   REAL    NOT NULL DEFAULT 0,
        "created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
        "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "columns" (
        "id"        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "board_id"  INTEGER NOT NULL,
        "name"      TEXT    NOT NULL,
        "color"     TEXT    NOT NULL DEFAULT '#5B616B',
        "wip_limit" INTEGER,
        "is_done"   INTEGER NOT NULL DEFAULT 0,
        "position"  REAL    NOT NULL DEFAULT 0,
        FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id"             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "column_id"      INTEGER NOT NULL,
        "title"          TEXT    NOT NULL,
        "description_md" TEXT,
        "priority"       TEXT    NOT NULL DEFAULT 'medium',
        "due_date"       DATETIME,
        "position"       REAL    NOT NULL DEFAULT 0,
        "archived_at"    DATETIME,
        "completed_at"   DATETIME,
        "created_at"     DATETIME NOT NULL DEFAULT (datetime('now')),
        "updated_at"     DATETIME NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("column_id") REFERENCES "columns" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notes" (
        "id"          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "task_id"     INTEGER,
        "title"       TEXT    NOT NULL DEFAULT '',
        "body_md"     TEXT    NOT NULL DEFAULT '',
        "pinned"      INTEGER NOT NULL DEFAULT 0,
        "archived_at" DATETIME,
        "created_at"  DATETIME NOT NULL DEFAULT (datetime('now')),
        "updated_at"  DATETIME NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tags" (
        "id"    INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name"  TEXT NOT NULL,
        "color" TEXT NOT NULL DEFAULT '#5B616B',
        CONSTRAINT "UQ_tags_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_tags" (
        "task_id" INTEGER NOT NULL,
        "tag_id"  INTEGER NOT NULL,
        PRIMARY KEY ("task_id", "tag_id"),
        FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("tag_id")  REFERENCES "tags"  ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "file_refs" (
        "id"          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "target_type" TEXT NOT NULL,
        "target_id"   INTEGER NOT NULL,
        "path"        TEXT NOT NULL,
        "label"       TEXT NOT NULL,
        "note"        TEXT,
        "created_at"  DATETIME NOT NULL DEFAULT (datetime('now')),
        CHECK ("target_type" IN ('task', 'note'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tasks_column_position"
       ON "tasks" ("column_id", "position")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notes_task_id"
       ON "notes" ("task_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notes_pinned_updated_at"
       ON "notes" ("pinned", "updated_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_file_refs_target"
       ON "file_refs" ("target_type", "target_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_task_tags_tag_id"
       ON "task_tags" ("tag_id")`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_task_tags_tag_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_file_refs_target"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notes_pinned_updated_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notes_task_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_column_position"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "file_refs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "task_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "columns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "boards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settings"`);
  }
}
