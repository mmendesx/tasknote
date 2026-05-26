import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { Repository, DataSource, EntityManager } from 'typeorm';
import { SettingsService } from './settings.service';
import { SettingsEntity } from './entities/settings.entity';
import type { SeedService } from '../seed/seed.service';

function makeSettingsRow(overrides: Partial<SettingsEntity> = {}): SettingsEntity {
  const row = new SettingsEntity();
  row.id = 1;
  row.displayName = '';
  row.theme = 'dark';
  row.accent = '#A3E635';
  row.defaultBoardId = null;
  row.onboardedAt = null;
  row.timezone = 'UTC';
  return Object.assign(row, overrides);
}

function makeRepoMock(row: SettingsEntity | null = null): Repository<SettingsEntity> {
  return {
    findOneBy: vi.fn().mockResolvedValue(row),
    save: vi.fn().mockImplementation((entity: SettingsEntity) => Promise.resolve(entity)),
    create: vi.fn().mockImplementation((data: Partial<SettingsEntity>) => Object.assign(new SettingsEntity(), data)),
  } as unknown as Repository<SettingsEntity>;
}

function makeSeedServiceMock(boardId = 42): SeedService {
  return {
    createSampleBoard: vi.fn().mockResolvedValue({ boardId }),
  } as unknown as SeedService;
}

function makeDataSourceMock(row: SettingsEntity | null = null): DataSource {
  const manager: Partial<EntityManager> = {
    findOneBy: vi.fn().mockResolvedValue(row),
    save: vi.fn().mockImplementation((_entity: unknown, data: SettingsEntity) =>
      Promise.resolve(data),
    ),
    create: vi.fn().mockImplementation((_entity: unknown, data: Partial<SettingsEntity>) =>
      Object.assign(new SettingsEntity(), data),
    ),
  };

  return {
    transaction: vi.fn().mockImplementation(
      (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager as EntityManager),
    ),
  } as unknown as DataSource;
}

describe('SettingsService', () => {
  describe('getOrDefault()', () => {
    it('returns default object when no row exists — does not insert', async () => {
      const repo = makeRepoMock(null);
      const ds = makeDataSourceMock(null);
      const seed = makeSeedServiceMock();
      const service = new SettingsService(repo, ds, seed);

      const result = await service.getOrDefault();

      expect(result).toEqual({
        id: 1,
        display_name: null,
        theme: 'dark',
        accent: '#A3E635',
        default_board_id: null,
        onboarded_at: null,
        timezone: 'UTC',
      });
      
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns persisted row when it exists', async () => {
      const now = new Date('2026-05-23T10:00:00.000Z');
      const row = makeSettingsRow({ displayName: 'Matheus', onboardedAt: now, defaultBoardId: 7 });
      const repo = makeRepoMock(row);
      const ds = makeDataSourceMock(row);
      const seed = makeSeedServiceMock();
      const service = new SettingsService(repo, ds, seed);

      const result = await service.getOrDefault();

      expect(result.display_name).toBe('Matheus');
      expect(result.onboarded_at).toBe(now.toISOString());
      expect(result.default_board_id).toBe(7);
    });
  });

  describe('onboard()', () => {
    it('sets onboarded_at and returns updated settings when seed=empty', async () => {
      
      const ds = makeDataSourceMock(null);
      const repo = makeRepoMock(null);
      const seed = makeSeedServiceMock();
      const service = new SettingsService(repo, ds, seed);

      const result = await service.onboard({
        display_name: 'Matheus',
        timezone: 'America/Sao_Paulo',
        seed: 'empty',
      });

      expect(result.display_name).toBe('Matheus');
      expect(result.timezone).toBe('America/Sao_Paulo');
      expect(result.onboarded_at).not.toBeNull();
      
      expect(seed.createSampleBoard).not.toHaveBeenCalled();
      
      expect(result.default_board_id).toBeNull();
    });

    it('creates sample board and sets default_board_id when seed=sample', async () => {
      const ds = makeDataSourceMock(null);
      const repo = makeRepoMock(null);
      const seed = makeSeedServiceMock(99);
      const service = new SettingsService(repo, ds, seed);

      const result = await service.onboard({
        display_name: 'Matheus',
        timezone: 'UTC',
        seed: 'sample',
      });

      expect(seed.createSampleBoard).toHaveBeenCalledOnce();
      expect(result.default_board_id).toBe(99);
      expect(result.onboarded_at).not.toBeNull();
    });

    it('throws ConflictException with code ALREADY_ONBOARDED when called a second time', async () => {
      const existingRow = makeSettingsRow({ onboardedAt: new Date('2026-01-01T00:00:00.000Z') });
      const ds = makeDataSourceMock(existingRow);
      const repo = makeRepoMock(existingRow);
      const seed = makeSeedServiceMock();
      const service = new SettingsService(repo, ds, seed);

      await expect(
        service.onboard({ display_name: 'Matheus', timezone: 'UTC', seed: 'empty' }),
      ).rejects.toThrow(ConflictException);

      let thrown: ConflictException | undefined;
      try {
        await service.onboard({ display_name: 'Matheus', timezone: 'UTC', seed: 'empty' });
      } catch (err) {
        thrown = err as ConflictException;
      }

      expect(thrown).toBeDefined();
      expect(thrown).toBeInstanceOf(ConflictException);
      const resp = thrown!.getResponse() as Record<string, unknown>;
      expect(resp['code']).toBe('ALREADY_ONBOARDED');

      expect(seed.createSampleBoard).not.toHaveBeenCalled();
    });
  });
});
