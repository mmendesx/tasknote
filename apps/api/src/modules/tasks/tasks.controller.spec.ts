import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TasksController } from './tasks.controller';

// Minimal stub service — only the methods the controller calls
function buildStubService() {
  return {
    listToday: vi.fn().mockResolvedValue([]),
    commit: vi.fn().mockResolvedValue({}),
    uncommit: vi.fn().mockResolvedValue({}),
    createTask: vi.fn(),
    listArchived: vi.fn(),
    getOne: vi.fn(),
    updateTask: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    moveTask: vi.fn(),
    permanentDelete: vi.fn(),
  } as unknown as InstanceType<typeof import('./tasks.service').TasksService>;
}

describe('TasksController — SCN-5: GET /tasks/today rejects bad/missing today', () => {
  it('throws BadRequestException with code INVALID_TODAY and does not call listToday when today is missing', () => {
    const service = buildStubService();
    const controller = new TasksController(service);

    expect(() => controller.listToday(undefined)).toThrow(BadRequestException);
    try {
      controller.listToday(undefined);
    } catch (e) {
      const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.code).toBe('INVALID_TODAY');
    }
    expect(service.listToday).not.toHaveBeenCalled();
  });

  it('throws BadRequestException with code INVALID_TODAY when today has wrong format', () => {
    const service = buildStubService();
    const controller = new TasksController(service);

    // Includes shape-valid-but-impossible dates: 2026-13-40 would 500 (RangeError),
    // 2026-02-30 would silently roll to Mar 2. Both must 400 INVALID_TODAY.
    const badValues = ['28-05-2026', '2026-5-28', 'today', '', 'not-a-date', '2026-13-40', '2026-02-30', '2026-00-10'];
    for (const bad of badValues) {
      expect(() => controller.listToday(bad)).toThrow(BadRequestException);
    }
    expect(service.listToday).not.toHaveBeenCalled();
  });

  it('throws BadRequestException with code INVALID_TODAY and not 500 or 404', () => {
    const service = buildStubService();
    const controller = new TasksController(service);

    let caught: BadRequestException | undefined;
    try {
      controller.listToday('bad-format');
    } catch (e) {
      caught = e as BadRequestException;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught!.getStatus()).toBe(400);
    const response = caught!.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('INVALID_TODAY');
  });

  it('delegates to listToday when today is valid YYYY-MM-DD', async () => {
    const service = buildStubService();
    const controller = new TasksController(service);

    await controller.listToday('2026-05-28');

    expect(service.listToday).toHaveBeenCalledOnce();
    expect(service.listToday).toHaveBeenCalledWith('2026-05-28');
  });
});
