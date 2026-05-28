import {
  BadRequestException,
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateTaskDtoSchema))
  createTask(@Body() dto: shared.CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  @Post('move')
  @UsePipes(new ZodValidationPipe(shared.MoveTaskDtoSchema))
  moveTask(@Body() dto: shared.MoveTaskDto) {
    return this.tasksService.moveTask(dto);
  }

  @Get('archived')
  listArchived(@Query('board_id', new ParseIntPipe({ optional: true })) boardId?: number) {
    return this.tasksService.listArchived(boardId);
  }

  @Get('today')
  listToday(@Query('today') today: string | undefined) {
    const parsed = shared.TodayQueryDtoSchema.safeParse({ today });
    if (!parsed.success) {
      throw new BadRequestException({ code: 'INVALID_TODAY' });
    }
    return this.tasksService.listToday(parsed.data.today);
  }

  @Get(':id')
  getTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.getOne(id);
  }

  @Patch(':id')
  updateTask(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateTaskDtoSchema)) dto: shared.UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.softDelete(id);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.restore(id);
  }

  @Post(':id/commit')
  commitTask(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.CommitTaskDtoSchema)) dto: shared.CommitTaskDto,
  ) {
    return this.tasksService.commit(id, dto.today);
  }

  @Delete(':id/commit')
  @HttpCode(HttpStatus.OK)
  uncommitTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.uncommit(id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  completeTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.complete(id);
  }

  @Delete(':id/complete')
  @HttpCode(HttpStatus.OK)
  uncompleteTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.uncomplete(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDelete(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.permanentDelete(id);
  }
}
