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
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateTagDtoSchema,
  UpdateTagDtoSchema,
  type CreateTagDto,
  type UpdateTagDto,
} from '@tasknote/shared';

import { TagsService } from './tags.service';
import { TagEntity } from './entities/tag.entity';

const AddTagToTaskBodySchema = z.object({
  tag_id: z.number().int().positive(),
});
type AddTagToTaskBody = z.infer<typeof AddTagToTaskBodySchema>;

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  listTags(): Promise<TagEntity[]> {
    return this.tagsService.listTags();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTag(
    @Body(new ZodValidationPipe(CreateTagDtoSchema)) dto: CreateTagDto,
  ): Promise<TagEntity> {
    return this.tagsService.createTag(dto);
  }

  @Patch(':id')
  updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateTagDtoSchema)) dto: UpdateTagDto,
  ): Promise<TagEntity> {
    return this.tagsService.updateTag(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tagsService.removeTag(id);
  }
}

@Controller('tasks/:taskId/tags')
export class TaskTagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async addTagToTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ZodValidationPipe(AddTagToTaskBodySchema)) body: AddTagToTaskBody,
  ): Promise<void> {
    await this.tagsService.addTagToTask(taskId, body.tag_id);
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTagFromTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ): Promise<void> {
    await this.tagsService.removeTagFromTask(taskId, tagId);
  }
}
