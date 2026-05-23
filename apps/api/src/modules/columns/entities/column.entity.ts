import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  ValueTransformer,
} from 'typeorm';
import { BoardEntity } from '../../boards/entities/board.entity';
import { TaskEntity } from '../../tasks/entities/task.entity';

// better-sqlite3 returns 0/1 for boolean columns — transform to true/false
// so JSON responses and TypeScript consumers get the correct type.
const booleanInt: ValueTransformer = {
  to: (v: boolean | null | undefined): number => (v ? 1 : 0),
  from: (v: number | null): boolean => v === 1,
};

@Entity('columns')
export class ColumnEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'board_id' })
  @Index()
  boardId!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '#5B616B' })
  color!: string;

  @Column({ type: 'integer', name: 'wip_limit', nullable: true, default: null })
  wipLimit!: number | null;

  // Stored as 0/1 in SQLite; transformer ensures TypeScript and JSON see a boolean.
  @Column({ type: 'integer', name: 'is_done', default: 0, transformer: booleanInt })
  isDone!: boolean;

  @Column({ type: 'real', default: 0 })
  position!: number;

  @ManyToOne(() => BoardEntity, (board) => board.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Relation<BoardEntity>;

  @OneToMany(() => TaskEntity, (task) => task.column)
  tasks!: Relation<TaskEntity>[];
}
