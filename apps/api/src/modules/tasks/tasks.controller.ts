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
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /** POST /api/tasks — create a task; position = max+1 within the column */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateTaskDtoSchema))
  createTask(@Body() dto: shared.CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  /** POST /api/tasks/move — move a task to a different column/position (transactional) */
  @Post('move')
  @UsePipes(new ZodValidationPipe(shared.MoveTaskDtoSchema))
  moveTask(@Body() dto: shared.MoveTaskDto) {
    return this.tasksService.moveTask(dto);
  }

  /** GET /api/tasks/archived?board_id=X — list archived tasks; filtered by board when provided */
  @Get('archived')
  listArchived(@Query('board_id', new ParseIntPipe({ optional: true })) boardId?: number) {
    return this.tasksService.listArchived(boardId);
  }

  /** GET /api/tasks/:id — fetch a single task with column + tags relations */
  @Get(':id')
  getTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.getOne(id);
  }

  /** PATCH /api/tasks/:id — partial update; if column_id changes, applies completed_at logic */
  @Patch(':id')
  updateTask(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateTaskDtoSchema)) dto: shared.UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(id, dto);
  }

  /** DELETE /api/tasks/:id — soft delete: sets archived_at = now() */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.softDelete(id);
  }

  /** POST /api/tasks/:id/restore — clears archived_at; returns updated task */
  @Post(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.restore(id);
  }

  /** DELETE /api/tasks/:id/permanent — hard delete; only allowed when archived_at is set */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDelete(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.permanentDelete(id);
  }
}
