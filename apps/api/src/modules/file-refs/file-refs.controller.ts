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

  @Get()
  listFileRefs(
    @Query('target_type') targetType: string,
    @Query('target_id', ParseIntPipe) targetId: number,
  ) {
    return this.fileRefsService.listFileRefs(targetType, targetId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateFileRefDtoSchema))
  createFileRef(@Body() dto: shared.CreateFileRefDto) {
    return this.fileRefsService.createFileRef(dto);
  }

  @Patch(':id')
  updateFileRef(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateFileRefDtoSchema)) dto: shared.UpdateFileRefDto,
  ) {
    return this.fileRefsService.updateFileRef(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFileRef(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.removeFileRef(id);
  }

  @Get(':id/exists')
  checkExists(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.exists(id);
  }

  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  openFile(@Param('id', ParseIntPipe) id: number) {
    return this.fileRefsService.openFile(id);
  }
}
