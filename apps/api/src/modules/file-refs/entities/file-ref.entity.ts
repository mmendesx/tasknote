import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Polymorphic association: target_type + target_id point to either a task or note.
// No foreign key is declared — polymorphic refs can't have a single FK constraint.
// An index on (target_type, target_id) satisfies per-spec lookup performance.
@Entity('file_refs')
@Index('IDX_file_refs_target', ['targetType', 'targetId'])
export class FileRefEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', name: 'target_type' })
  targetType!: string;

  @Column({ type: 'integer', name: 'target_id' })
  targetId!: number;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'text', nullable: true, default: null })
  note!: string | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;
}
