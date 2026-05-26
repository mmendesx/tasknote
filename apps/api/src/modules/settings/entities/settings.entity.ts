import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('settings')
export class SettingsEntity {
  
  @PrimaryColumn({ type: 'integer', default: 1 })
  id: 1 = 1;

  @Column({ type: 'text', name: 'display_name', default: '' })
  displayName!: string;

  @Column({ type: 'text', default: 'dark' })
  theme!: string;

  @Column({ type: 'text', default: '#A3E635' })
  accent!: string;

  @Column({ type: 'integer', name: 'default_board_id', nullable: true, default: null })
  defaultBoardId!: number | null;

  @Column({ type: 'datetime', name: 'onboarded_at', nullable: true, default: null })
  onboardedAt!: Date | null;

  @Column({ type: 'text', default: 'UTC' })
  timezone!: string;
}
