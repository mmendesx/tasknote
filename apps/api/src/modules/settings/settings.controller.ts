import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UpdateSettingsDtoSchema, OnboardDtoSchema } from '@tasknote/shared';
import type { UpdateSettingsDto, OnboardDto } from '@tasknote/shared';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/settings
   * Returns the singleton settings row or a default response when no row exists.
   */
  @Get()
  getSettings() {
    return this.settingsService.getOrDefault();
  }

  /**
   * PATCH /api/settings
   * Partial update. Creates the row if missing (upsert id=1).
   */
  @Patch()
  @UsePipes(new ZodValidationPipe(UpdateSettingsDtoSchema))
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.upsert(dto);
  }

  /**
   * POST /api/settings/onboard
   * Completes onboarding. Seeds sample data when seed='sample'.
   * Returns 409 ALREADY_ONBOARDED if onboarded_at is already set.
   */
  @Post('onboard')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(OnboardDtoSchema))
  onboard(@Body() dto: OnboardDto) {
    return this.settingsService.onboard(dto);
  }
}
