import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import * as shared from '@tasknote/shared';
import { FileRefsService } from './file-refs.service';

@Controller('file-refs')
export class FileRefsController {
  constructor(private readonly fileRefsService: FileRefsService) {}

  /**
   * GET /api/file-refs?target_type=&target_id=
   * Lists all file references for a given target (task or note).
   * Both query parameters are required — 400 is returned by the pipe if missing.
   */
  @Get()
  listFileRefs(
    @Query('target_type') targetType: string,
    @Query('target_id', ParseIntPipe) targetId: number,
  ) {
    return this.fileRefsService.listFileRefs(targetType, targetId);
  }

  /**
   * POST /api/file-refs — create a new file reference.
   * Path validation (absolute + no shell metacharacters) is enforced by the
   * Zod schema and re-checked inside the service as defense-in-depth.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateFileRefDtoSchema))
  createFileRef(@Body() dto: shared.CreateFileRefDto) {
    return this.fileRefsService.createFileRef(dto);
  }

  /**
   * PATCH /api/file-refs/:id — partial update.
   * If path is included, it is re-validated by the service layer.
   */
  @Patch(':id')
  updateFileRef(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateFileRefDtoSchema)) dto: shared.UpdateFileRefDto,
  ) {
    return this.fileRefsService.updateFileRef(id, dto);
  }

  /**
   * DELETE /api/file-refs/:id — hard delete.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFileRef(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.removeFileRef(id);
  }

  /**
   * GET /api/file-refs/:id/exists
   * Runs fs.stat on the stored path. Returns { exists: boolean }.
   * Supports the "Missing file shows broken indicator" scenario.
   */
  @Get(':id/exists')
  checkExists(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.exists(id);
  }

  /**
   * POST /api/file-refs/:id/open
   * Launches the file in the OS default application using a platform-specific
   * binary (open / xdg-open / explorer.exe). No shell is invoked.
   */
  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  openFile(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.openFile(id);
  }
}
