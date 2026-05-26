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
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import * as shared from '@tasknote/shared';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  listNotes(@Query('task_id', new ParseIntPipe({ optional: true })) taskId?: number) {
    return this.notesService.listNotes(taskId);
  }

  @Get('archived')
  listArchived() {
    return this.notesService.listArchived();
  }

  @Get(':id')
  getNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.getNote(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createNote(@Body(new ZodValidationPipe(shared.CreateNoteDtoSchema)) dto: shared.CreateNoteDto) {
    return this.notesService.createNote(dto);
  }

  @Patch(':id')
  updateNote(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateNoteDtoSchema)) dto: shared.UpdateNoteDto,
  ) {
    return this.notesService.updateNote(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDeleteNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.softDeleteNote(id);
  }

  @Post(':id/restore')
  restoreNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.restoreNote(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDeleteNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.permanentDeleteNote(id);
  }
}
