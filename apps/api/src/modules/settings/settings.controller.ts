import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UpdateSettingsDtoSchema, OnboardDtoSchema } from '@tasknote/shared';
import type { UpdateSettingsDto, OnboardDto } from '@tasknote/shared';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getOrDefault();
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(UpdateSettingsDtoSchema))
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.upsert(dto);
  }

  @Post('onboard')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(OnboardDtoSchema))
  onboard(@Body() dto: OnboardDto) {
    return this.settingsService.onboard(dto);
  }
}
