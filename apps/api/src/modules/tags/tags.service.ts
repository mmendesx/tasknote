import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type { CreateTagDto, UpdateTagDto } from '@tasknote/shared';
import { TagEntity } from './entities/tag.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    @InjectRepository(TagEntity)
    private readonly tagsRepo: Repository<TagEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
    private readonly dataSource: DataSource,
  ) {}

  listTags(): Promise<TagEntity[]> {
    this.logger.log('listTags: fetching all tags ordered by name asc');
    return this.tagsRepo.find({ order: { name: 'ASC' } });
  }

  async createTag(dto: CreateTagDto): Promise<TagEntity> {
    this.logger.log(`createTag: creating tag name="${dto.name}" color="${dto.color}"`);

    const tag = this.tagsRepo.create({ name: dto.name, color: dto.color });

    try {
      const saved = await this.tagsRepo.save(tag);
      this.logger.log(`createTag: created tag id=${saved.id} name="${saved.name}"`);
      return saved;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        this.logger.warn(`createTag: duplicate name="${dto.name}"`);
        throw new ConflictException({ code: 'DUPLICATE_TAG', message: `Tag name '${dto.name}' already exists` });
      }
      throw err;
    }
  }

  async updateTag(id: number, dto: UpdateTagDto): Promise<TagEntity> {
    this.logger.log(`updateTag: updating tag id=${id}`);

    const tag = await this.tagsRepo.findOne({ where: { id } });
    if (!tag) {
      this.logger.warn(`updateTag: tag id=${id} not found`);
      throw new NotFoundException(`Tag with id '${id}' not found`);
    }

    if (dto.name !== undefined) tag.name = dto.name;
    if (dto.color !== undefined) tag.color = dto.color;

    try {
      const updated = await this.tagsRepo.save(tag);
      this.logger.log(`updateTag: tag id=${id} updated`);
      return updated;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        this.logger.warn(`updateTag: duplicate name="${dto.name}" on tag id=${id}`);
        throw new ConflictException({ code: 'DUPLICATE_TAG', message: `Tag name '${dto.name}' already exists` });
      }
      throw err;
    }
  }

  async removeTag(id: number): Promise<void> {
    this.logger.log(`removeTag: deleting tag id=${id}`);

    const result = await this.tagsRepo.delete(id);
    if (result.affected === 0) {
      this.logger.warn(`removeTag: tag id=${id} not found`);
      throw new NotFoundException(`Tag with id '${id}' not found`);
    }

    // ON DELETE CASCADE on task_tags.tag_id handles join-table rows automatically.
    this.logger.log(`removeTag: tag id=${id} deleted (cascade removed task_tags rows)`);
  }

  async addTagToTask(taskId: number, tagId: number): Promise<void> {
    this.logger.log(`addTagToTask: linking tag id=${tagId} to task id=${taskId}`);

    const task = await this.tasksRepo.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.warn(`addTagToTask: task id=${taskId} not found`);
      throw new NotFoundException(`Task with id '${taskId}' not found`);
    }

    const tag = await this.tagsRepo.findOne({ where: { id: tagId } });
    if (!tag) {
      this.logger.warn(`addTagToTask: tag id=${tagId} not found`);
      throw new NotFoundException(`Tag with id '${tagId}' not found`);
    }

    // Check for existing link before inserting to stay idempotent.
    // The relation builder's .add() does not deduplicate on its own.
    const existing = await this.dataSource
      .createQueryBuilder()
      .select('1')
      .from('task_tags', 'tt')
      .where('tt.task_id = :taskId AND tt.tag_id = :tagId', { taskId, tagId })
      .getRawOne<Record<string, unknown>>();

    if (existing) {
      this.logger.log(`addTagToTask: tag id=${tagId} already linked to task id=${taskId} — no-op`);
      return;
    }

    await this.dataSource
      .createQueryBuilder()
      .relation(TaskEntity, 'tags')
      .of(taskId)
      .add(tagId);

    this.logger.log(`addTagToTask: tag id=${tagId} linked to task id=${taskId}`);
  }

  async removeTagFromTask(taskId: number, tagId: number): Promise<void> {
    this.logger.log(`removeTagFromTask: unlinking tag id=${tagId} from task id=${taskId}`);

    const task = await this.tasksRepo.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.warn(`removeTagFromTask: task id=${taskId} not found`);
      throw new NotFoundException(`Task with id '${taskId}' not found`);
    }

    // Check link exists before attempting removal — keeps operation no-op safe.
    const existing = await this.dataSource
      .createQueryBuilder()
      .select('1')
      .from('task_tags', 'tt')
      .where('tt.task_id = :taskId AND tt.tag_id = :tagId', { taskId, tagId })
      .getRawOne<Record<string, unknown>>();

    if (!existing) {
      this.logger.log(`removeTagFromTask: tag id=${tagId} was not linked to task id=${taskId} — no-op`);
      return;
    }

    await this.dataSource
      .createQueryBuilder()
      .relation(TaskEntity, 'tags')
      .of(taskId)
      .remove(tagId);

    this.logger.log(`removeTagFromTask: tag id=${tagId} unlinked from task id=${taskId}`);
  }
}

/**
 * SQLite UNIQUE constraint violations surface as QueryFailedError with a
 * message containing "UNIQUE constraint failed". This helper centralises the
 * detection so callers don't couple to the raw error string.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    typeof (err as QueryFailedError & { message: string }).message === 'string' &&
    (err as QueryFailedError & { message: string }).message.includes('UNIQUE constraint failed')
  );
}
