import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('export')
  async exportDb(@Res() res: Response): Promise<void> {
    this.logger.log('GET /export: export requested');

    const payload = await this.adminService.exportAll();

    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const timestamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const filename = `tasknote-export-${timestamp}.json`;
    const json = JSON.stringify(payload, null, 2);

    this.logger.log(`GET /export: sending attachment filename=${filename} bytes=${json.length}`);

    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'application/json')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(json);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  async importDb(@Body() body: unknown) {
    this.logger.log('POST /import: import requested');
    
    return this.adminService.importAll(body);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetDb(@Body() body: unknown) {
    this.logger.log('POST /reset: reset requested');
    
    return this.adminService.reset(body);
  }
}
