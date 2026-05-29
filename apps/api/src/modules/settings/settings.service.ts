import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import type { Repository, DataSource } from 'typeorm';
import type { UpdateSettingsDto, OnboardDto } from '@tasknote/shared';
import { SettingsEntity } from './entities/settings.entity';
import { SeedService } from '../seed/seed.service';

export interface SettingsResponse {
  id: 1;
  display_name: string | null;
  theme: string;
  accent: string;
  default_board_id: number | null;
  onboarded_at: string | null;
  timezone: string;
}

const SETTINGS_DEFAULTS: SettingsResponse = {
  id: 1,
  display_name: null,
  theme: 'dark',
  accent: '#A3E635',
  default_board_id: null,
  onboarded_at: null,
  timezone: 'UTC',
};

function toResponse(entity: SettingsEntity): SettingsResponse {
  return {
    id: 1,
    display_name: entity.displayName || null,
    theme: entity.theme,
    accent: entity.accent,
    default_board_id: entity.defaultBoardId ?? null,
    onboarded_at: entity.onboardedAt ? entity.onboardedAt.toISOString() : null,
    timezone: entity.timezone,
  };
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(SettingsEntity)
    private readonly settingsRepo: Repository<SettingsEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly seedService: SeedService,
  ) {}

  async getOrDefault(): Promise<SettingsResponse> {
    const row = await this.settingsRepo.findOneBy({ id: 1 });
    if (!row) {
      this.logger.log('No settings row found — returning defaults');
      return { ...SETTINGS_DEFAULTS };
    }
    return toResponse(row);
  }

  async upsert(dto: UpdateSettingsDto): Promise<SettingsResponse> {
    let row = await this.settingsRepo.findOneBy({ id: 1 });

    if (!row) {
      this.logger.log('Settings row missing — creating before applying update');
      row = this.settingsRepo.create({
        id: 1,
        displayName: '',
        theme: 'dark',
        accent: '#A3E635',
        defaultBoardId: null,
        onboardedAt: null,
        timezone: 'UTC',
      });
    }

    if (dto.display_name !== undefined) row.displayName = dto.display_name;
    if (dto.theme !== undefined) row.theme = dto.theme;
    if (dto.accent !== undefined) row.accent = dto.accent;
    if (dto.default_board_id !== undefined) row.defaultBoardId = dto.default_board_id;
    if (dto.timezone !== undefined) row.timezone = dto.timezone;

    const saved = await this.settingsRepo.save(row);
    this.logger.log('Settings updated');
    return toResponse(saved);
  }

  async onboard(dto: OnboardDto): Promise<SettingsResponse> {
    return this.dataSource.transaction(async (manager) => {
      
      const existing = await manager.findOneBy(SettingsEntity, { id: 1 });

      if (existing?.onboardedAt) {
        this.logger.warn('Onboard called but user is already onboarded');
        throw new ConflictException({
          code: 'ALREADY_ONBOARDED',
          message: 'User has already completed onboarding',
        });
      }

      let defaultBoardId: number | null = null;

      if (dto.seed === 'sample') {
        this.logger.log('Seeding sample board');
        const result = await this.seedService.createSampleBoard(manager);
        defaultBoardId = result.boardId;
      }

      const row = existing ?? manager.create(SettingsEntity, { id: 1 });
      row.displayName = dto.display_name;
      row.timezone = dto.timezone;
      row.onboardedAt = new Date();
      if (defaultBoardId !== null) {
        row.defaultBoardId = defaultBoardId;
      }
      
      if (!existing) {
        row.theme = 'dark';
        row.accent = '#A3E635';
      }

      const saved = await manager.save(SettingsEntity, row);
      this.logger.log(
        `Onboarding complete: displayName=${saved.displayName}, seed=${dto.seed}, defaultBoardId=${saved.defaultBoardId}`,
      );
      return toResponse(saved);
    });
  }
}
