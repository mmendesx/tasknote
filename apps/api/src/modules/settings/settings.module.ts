import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsEntity } from './entities/settings.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SeedModule } from '../seed/seed.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SettingsEntity]),
    SeedModule,
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
