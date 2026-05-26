import * as typeorm from 'typeorm';
import { BoardEntity } from '../../boards/entities/board.entity';
import { TaskEntity } from '../../tasks/entities/task.entity';

const booleanInt: typeorm.ValueTransformer = {
  to: (v: boolean | null | undefined): number => (v ? 1 : 0),
  from: (v: number | null): boolean => v === 1,
};

@typeorm.Entity('columns')
export class ColumnEntity {
  @typeorm.PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @typeorm.Column({ type: 'integer', name: 'board_id' })
  @typeorm.Index()
  boardId!: number;

  @typeorm.Column({ type: 'text' })
  name!: string;

  @typeorm.Column({ type: 'text', default: '#5B616B' })
  color!: string;

  @typeorm.Column({ type: 'integer', name: 'wip_limit', nullable: true, default: null })
  wipLimit!: number | null;

  @typeorm.Column({ type: 'integer', name: 'is_done', default: 0, transformer: booleanInt })
  isDone!: boolean;

  @typeorm.Column({ type: 'real', default: 0 })
  position!: number;

  @typeorm.ManyToOne(() => BoardEntity, (board) => board.columns, { onDelete: 'CASCADE' })
  @typeorm.JoinColumn({ name: 'board_id' })
  board!: typeorm.Relation<BoardEntity>;

  @typeorm.OneToMany(() => TaskEntity, (task) => task.column)
  tasks!: typeorm.Relation<TaskEntity>[];
}
