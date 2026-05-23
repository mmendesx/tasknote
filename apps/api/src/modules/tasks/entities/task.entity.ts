import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnEntity } from '../../columns/entities/column.entity';
import { TagEntity } from '../../tags/entities/tag.entity';
import { NoteEntity } from '../../notes/entities/note.entity';

@Entity('tasks')
@Index('IDX_tasks_column_position', ['columnId', 'position'])
export class TaskEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'column_id' })
  columnId!: number;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', name: 'description_md', nullable: true, default: null })
  descriptionMd!: string | null;

  @Column({ type: 'text', default: 'medium' })
  priority!: string;

  @Column({ type: 'datetime', name: 'due_date', nullable: true, default: null })
  dueDate!: Date | null;

  @Column({ type: 'real', default: 0 })
  position!: number;

  @Column({ type: 'datetime', name: 'archived_at', nullable: true, default: null })
  archivedAt!: Date | null;

  @Column({ type: 'datetime', name: 'completed_at', nullable: true, default: null })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => ColumnEntity, (col) => col.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'column_id' })
  column!: Relation<ColumnEntity>;

  @ManyToMany(() => TagEntity, (tag) => tag.tasks)
  @JoinTable({
    name: 'task_tags',
    joinColumn: { name: 'task_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: Relation<TagEntity>[];

  @OneToMany(() => NoteEntity, (note) => note.task)
  notes!: Relation<NoteEntity>[];
}
