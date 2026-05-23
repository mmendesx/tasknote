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

/**
 * AdminController — data management endpoints.
 *
 * GET  /api/export  — download full JSON dump (attachment)
 * POST /api/import  — replace all DB contents from a JSON payload
 * POST /api/reset   — wipe user data and clear onboarded_at
 */
@Controller()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /api/export
   * Streams a JSON dump of all tables as a downloadable attachment.
   * Content-Type: application/json
   * Content-Disposition: attachment; filename=tasknote-export-YYYYMMDD-HHMMSS.json
   */
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

  /**
   * POST /api/import
   * Body: { confirm: 'IMPORT', data: <export data shape> }
   * Returns 400 CONFIRM_REQUIRED when confirm is missing or wrong.
   * Returns 400 INVALID_IMPORT_PAYLOAD when data shape fails Zod validation.
   * On success returns 200 { imported: true }.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  async importDb(@Body() body: unknown) {
    this.logger.log('POST /import: import requested');
    // Confirm and shape guards are enforced inside the service — pass body through directly.
    return this.adminService.importAll(body);
  }

  /**
   * POST /api/reset
   * Body: { confirm: 'RESET' }
   * Returns 400 CONFIRM_REQUIRED when confirm is missing or wrong.
   * On success returns 200 { reset: true }.
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetDb(@Body() body: unknown) {
    this.logger.log('POST /reset: reset requested');
    // Confirm guard is enforced inside the service — pass body through directly.
    return this.adminService.reset(body);
  }
}
