import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import type { DiagramScene } from '@tasknote/shared';

const sceneJsonTransformer: ValueTransformer = {
  to: (v: DiagramScene | null | undefined): string =>
    JSON.stringify(
      v ?? { version: 1, elements: [], appState: { viewport: { scrollX: 0, scrollY: 0, zoom: 1 } } },
    ),
  from: (v: string | null): DiagramScene | null => (v ? JSON.parse(v) : null),
};

@Entity('diagrams')
@Index('IDX_diagrams_updated_at', ['updatedAt'])
export class DiagramEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', default: '' })
  title!: string;

  @Column({ type: 'text', name: 'scene_json', transformer: sceneJsonTransformer })
  sceneJson!: DiagramScene;

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt!: Date;
}
