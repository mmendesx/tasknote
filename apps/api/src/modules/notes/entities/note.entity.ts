import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { TaskEntity } from '../../tasks/entities/task.entity';

const booleanInt: ValueTransformer = {
  to: (v: boolean | null | undefined): number => (v ? 1 : 0),
  from: (v: number | null): boolean => v === 1,
};

@Entity('notes')
@Index('IDX_notes_pinned_updated_at', ['pinned', 'updatedAt'])
export class NoteEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'task_id', nullable: true, default: null })
  @Index('IDX_notes_task_id')
  taskId!: number | null;

  @Column({ type: 'text', default: '' })
  title!: string;

  @Column({ type: 'text', name: 'body_md', default: '' })
  bodyMd!: string;

  @Column({ type: 'integer', default: 0, transformer: booleanInt })
  pinned!: boolean;

  @Column({ type: 'datetime', name: 'archived_at', nullable: true, default: null })
  archivedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => TaskEntity, (task) => task.notes, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'task_id' })
  task!: Relation<TaskEntity> | null;
}
