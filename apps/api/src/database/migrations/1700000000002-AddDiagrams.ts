import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiagrams1700000000002 implements MigrationInterface {
  name = 'AddDiagrams1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "diagrams" (
        "id"         INTEGER  PRIMARY KEY AUTOINCREMENT NOT NULL,
        "title"      TEXT     NOT NULL DEFAULT '',
        "scene_json" TEXT     NOT NULL,
        "created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
        "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_diagrams_updated_at"
       ON "diagrams" ("updated_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_diagrams_updated_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "diagrams"`);
  }
}
