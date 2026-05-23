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
import {
  CreateNoteDto,
  CreateNoteDtoSchema,
  UpdateNoteDto,
  UpdateNoteDtoSchema,
} from '@tasknote/shared';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /** GET /api/notes — list active notes; pinned first then updated_at desc. Optional ?task_id= filter. */
  @Get()
  listNotes(@Query('task_id', new ParseIntPipe({ optional: true })) taskId?: number) {
    return this.notesService.listNotes(taskId);
  }

  /** GET /api/notes/:id — single note */
  @Get(':id')
  getNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.getNote(id);
  }

  /** POST /api/notes — create note; derives title from body when title is blank */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createNote(@Body(new ZodValidationPipe(CreateNoteDtoSchema)) dto: CreateNoteDto) {
    return this.notesService.createNote(dto);
  }

  /** PATCH /api/notes/:id — partial update; re-derives title when title is cleared or omitted with body change */
  @Patch(':id')
  updateNote(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateNoteDtoSchema)) dto: UpdateNoteDto,
  ) {
    return this.notesService.updateNote(id, dto);
  }

  /** DELETE /api/notes/:id — soft delete (sets archived_at = now()) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDeleteNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.softDeleteNote(id);
  }

  /** POST /api/notes/:id/restore — clears archived_at */
  @Post(':id/restore')
  restoreNote(@Param('id', ParseIntPipe) id: number) {
    return this.notesService.restoreNote(id);
  }
}
