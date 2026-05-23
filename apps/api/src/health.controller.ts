import { Controller, Get } from '@nestjs/common';
import { dbPath } from './database/data-source';

const VERSION = '0.1.0';

@Controller('health')
export class HealthController {
  @Get()
  check(): { ok: boolean; version: string; db_path: string } {
    return { ok: true, version: VERSION, db_path: dbPath };
  }
}
