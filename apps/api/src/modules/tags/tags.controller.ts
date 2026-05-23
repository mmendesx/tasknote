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

/** GET /api/tags, POST /api/tags, PATCH /api/tags/:id, DELETE /api/tags/:id */
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /** GET /api/tags — list all tags ordered by name asc */
  @Get()
  listTags(): Promise<TagEntity[]> {
    return this.tagsService.listTags();
  }

  /** POST /api/tags — create a tag; 409 DUPLICATE_TAG if name already exists */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTag(
    @Body(new ZodValidationPipe(CreateTagDtoSchema)) dto: CreateTagDto,
  ): Promise<TagEntity> {
    return this.tagsService.createTag(dto);
  }

  /** PATCH /api/tags/:id — partial update; 409 DUPLICATE_TAG on name collision */
  @Patch(':id')
  updateTag(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateTagDtoSchema)) dto: UpdateTagDto,
  ): Promise<TagEntity> {
    return this.tagsService.updateTag(id, dto);
  }

  /** DELETE /api/tags/:id — deletes tag; cascade removes task_tags rows via FK */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tagsService.removeTag(id);
  }
}

/** POST /api/tasks/:taskId/tags, DELETE /api/tasks/:taskId/tags/:tagId */
@Controller('tasks/:taskId/tags')
export class TaskTagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * POST /api/tasks/:taskId/tags
   * Body: { tag_id: number }
   * Idempotent — no error if the tag is already linked.
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async addTagToTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ZodValidationPipe(AddTagToTaskBodySchema)) body: AddTagToTaskBody,
  ): Promise<void> {
    await this.tagsService.addTagToTask(taskId, body.tag_id);
  }

  /** DELETE /api/tasks/:taskId/tags/:tagId — no-op if link does not exist */
  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTagFromTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ): Promise<void> {
    await this.tagsService.removeTagFromTask(taskId, tagId);
  }
}
