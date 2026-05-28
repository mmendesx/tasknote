import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommittedOn1700000000001 implements MigrationInterface {
  name = 'AddCommittedOn1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN "committed_on" DATETIME`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_committed_on" ON "tasks" ("committed_on")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_committed_on"`);

    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN "committed_on"`,
    );
  }
}
