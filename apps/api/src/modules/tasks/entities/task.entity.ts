import * as typeorm from 'typeorm';
import { ColumnEntity } from '../../columns/entities/column.entity';
import { TagEntity } from '../../tags/entities/tag.entity';
import { NoteEntity } from '../../notes/entities/note.entity';

@typeorm.Entity('tasks')
@typeorm.Index('IDX_tasks_column_position', ['columnId', 'position'])
export class TaskEntity {
  @typeorm.PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @typeorm.Column({ type: 'integer', name: 'column_id' })
  columnId!: number;

  @typeorm.Column({ type: 'text' })
  title!: string;

  @typeorm.Column({ type: 'text', name: 'description_md', nullable: true, default: null })
  descriptionMd!: string | null;

  @typeorm.Column({ type: 'text', default: 'medium' })
  priority!: string;

  @typeorm.Column({ type: 'datetime', name: 'due_date', nullable: true, default: null })
  dueDate!: Date | null;

  @typeorm.Column({ type: 'real', default: 0 })
  position!: number;

  @typeorm.Column({ type: 'datetime', name: 'archived_at', nullable: true, default: null })
  archivedAt!: Date | null;

  @typeorm.Column({ type: 'datetime', name: 'completed_at', nullable: true, default: null })
  completedAt!: Date | null;

  @typeorm.Column({ type: 'datetime', name: 'committed_on', nullable: true, default: null })
  committedOn!: Date | null;

  @typeorm.CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @typeorm.UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;

  @typeorm.ManyToOne(() => ColumnEntity, (col) => col.tasks, { onDelete: 'CASCADE' })
  @typeorm.JoinColumn({ name: 'column_id' })
  column!: typeorm.Relation<ColumnEntity>;

  @typeorm.ManyToMany(() => TagEntity, (tag) => tag.tasks)
  @typeorm.JoinTable({
    name: 'task_tags',
    joinColumn: { name: 'task_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags!: typeorm.Relation<TagEntity>[];

  @typeorm.OneToMany(() => NoteEntity, (note) => note.task)
  notes!: typeorm.Relation<NoteEntity>[];
}
