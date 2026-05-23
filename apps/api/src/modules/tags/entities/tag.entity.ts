import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from 'typeorm';
import { TaskEntity } from '../../tasks/entities/task.entity';

@Entity('tags')
@Unique('UQ_tags_name', ['name'])
export class TagEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '#5B616B' })
  color!: string;

  @ManyToMany(() => TaskEntity, (task) => task.tags)
  tasks!: Relation<TaskEntity>[];
}
