import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { CreateTaskDto, UpdateTaskDto, MoveTaskDto } from '@tasknote/shared';
import { TaskEntity } from './entities/task.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { FileRefsService } from '../file-refs/file-refs.service';

/**
 * Normalizes a due_date value from the DTO to a Date stored at noon UTC,
 * preventing day-flip across timezones (FR-4).
 * Accepts YYYY-MM-DD or full ISO strings.
 */
function normalizeDueDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }
  return new Date(value);
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
    @InjectRepository(ColumnEntity)
    private readonly columnsRepo: Repository<ColumnEntity>,
    private readonly dataSource: DataSource,
    private readonly fileRefsService: FileRefsService,
  ) {}

  async createTask(dto: CreateTaskDto): Promise<TaskEntity> {
    this.logger.log(`createTask: column_id=${dto.column_id} title="${dto.title}"`);

    return this.dataSource.transaction(async (manager) => {
      
      const column = await manager.findOne(ColumnEntity, { where: { id: dto.column_id } });
      if (!column) {
        this.logger.warn(`createTask: column id=${dto.column_id} not found`);
        throw new NotFoundException(`Column with id '${dto.column_id}' not found`);
      }

      const result = await manager
        .createQueryBuilder(TaskEntity, 't')
        .select('MAX(t.position)', 'maxPos')
        .where('t.column_id = :columnId', { columnId: dto.column_id })
        .getRawOne<{ maxPos: number | null }>();

      const nextPosition = (result?.maxPos ?? -1) + 1;

      this.logger.log(
        `createTask: assigning position=${nextPosition} in column_id=${dto.column_id}`,
      );

      const task = manager.create(TaskEntity, {
        columnId: dto.column_id,
        title: dto.title,
        descriptionMd: dto.description_md ?? null,
        priority: dto.priority ?? 'medium',
        dueDate: dto.due_date ? normalizeDueDate(dto.due_date) : null,
        committedOn: dto.committed_on ? normalizeDueDate(dto.committed_on) : null,
        position: nextPosition,
      });

      const saved = await manager.save(TaskEntity, task);
      this.logger.log(`createTask: created task id=${saved.id}`);
      return saved;
    });
  }

  async listArchived(boardId?: number): Promise<TaskEntity[]> {
    this.logger.log(`listArchived: board_id=${boardId ?? 'all'}`);

    const qb = this.tasksRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.column', 'column')
      .where('task.archived_at IS NOT NULL')
      .orderBy('task.archived_at', 'DESC');

    if (boardId !== undefined) {
      qb.andWhere('column.board_id = :boardId', { boardId });
    }

    return qb.getMany();
  }

  async getOne(id: number): Promise<TaskEntity> {
    this.logger.log(`getOne: loading task id=${id} with column + tags relations`);

    const task = await this.tasksRepo.findOne({
      where: { id },
      relations: ['column', 'tags'],
    });

    if (!task) {
      this.logger.warn(`getOne: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    return task;
  }

  async updateTask(id: number, dto: UpdateTaskDto): Promise<TaskEntity> {
    this.logger.log(`updateTask: task id=${id}`);

    return this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(TaskEntity, { where: { id } });
      if (!task) {
        this.logger.warn(`updateTask: task id=${id} not found`);
        throw new NotFoundException(`Task with id '${id}' not found`);
      }

      const isColumnChanging =
        dto.column_id !== undefined && dto.column_id !== task.columnId;

      if (isColumnChanging) {
        const newColumn = await manager.findOne(ColumnEntity, {
          where: { id: dto.column_id },
        });
        if (!newColumn) {
          this.logger.warn(`updateTask: new column id=${dto.column_id} not found`);
          throw new NotFoundException(`Column with id '${dto.column_id}' not found`);
        }

        const oldColumn = await manager.findOne(ColumnEntity, {
          where: { id: task.columnId },
        });

        if (newColumn.isDone && !oldColumn?.isDone) {
          task.completedAt = new Date();
          this.logger.log(
            `updateTask: task id=${id} moved to done column — setting completed_at`,
          );
        } else if (!newColumn.isDone && oldColumn?.isDone) {
          task.completedAt = null;
          this.logger.log(
            `updateTask: task id=${id} moved from done column — clearing completed_at`,
          );
        }

        const result = await manager
          .createQueryBuilder(TaskEntity, 't')
          .select('MAX(t.position)', 'maxPos')
          .where('t.column_id = :columnId', { columnId: dto.column_id })
          .getRawOne<{ maxPos: number | null }>();

        task.position = (result?.maxPos ?? -1) + 1;
        task.columnId = dto.column_id!;
      }

      if (dto.title !== undefined) task.title = dto.title;
      if (dto.description_md !== undefined) task.descriptionMd = dto.description_md ?? null;
      if (dto.priority !== undefined) task.priority = dto.priority;
      if (dto.due_date !== undefined) {
        task.dueDate = dto.due_date ? normalizeDueDate(dto.due_date) : null;
      }
      if (dto.committed_on !== undefined) {
        task.committedOn = dto.committed_on ? normalizeDueDate(dto.committed_on) : null;
      }

      const updated = await manager.save(TaskEntity, task);
      this.logger.log(`updateTask: task id=${id} updated`);
      return updated;
    });
  }

  async softDelete(id: number): Promise<void> {
    this.logger.log(`softDelete: archiving task id=${id}`);

    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      this.logger.warn(`softDelete: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.archivedAt = new Date();
    await this.tasksRepo.save(task);
    this.logger.log(`softDelete: task id=${id} archived at ${task.archivedAt.toISOString()}`);
  }

  async restore(id: number): Promise<TaskEntity> {
    this.logger.log(`restore: restoring task id=${id}`);

    const task = await this.tasksRepo.findOne({
      where: { id },
      relations: ['column', 'tags'],
    });
    if (!task) {
      this.logger.warn(`restore: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.archivedAt = null;
    const updated = await this.tasksRepo.save(task);
    this.logger.log(`restore: task id=${id} restored`);
    return updated;
  }

  async moveTask(dto: MoveTaskDto): Promise<TaskEntity> {
    this.logger.log(
      `moveTask: task_id=${dto.task_id} → column_id=${dto.column_id} position=${dto.position}`,
    );

    return this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(TaskEntity, { where: { id: dto.task_id } });
      if (!task) {
        this.logger.warn(`moveTask: task id=${dto.task_id} not found`);
        throw new NotFoundException(`Task with id '${dto.task_id}' not found`);
      }

      const newColumn = await manager.findOne(ColumnEntity, { where: { id: dto.column_id } });
      if (!newColumn) {
        this.logger.warn(`moveTask: column id=${dto.column_id} not found`);
        throw new NotFoundException(`Column with id '${dto.column_id}' not found`);
      }

      const isSameColumn = task.columnId === dto.column_id;

      if (!isSameColumn) {
        
        const oldColumn = await manager.findOne(ColumnEntity, { where: { id: task.columnId } });

        if (newColumn.isDone && !oldColumn?.isDone) {
          task.completedAt = new Date();
          this.logger.log(
            `moveTask: task id=${dto.task_id} moved to done column — setting completed_at`,
          );
        } else if (!newColumn.isDone && oldColumn?.isDone) {
          task.completedAt = null;
          this.logger.log(
            `moveTask: task id=${dto.task_id} moved from done column — clearing completed_at`,
          );
        }
      }

      task.columnId = dto.column_id;
      task.position = dto.position;

      const updated = await manager.save(TaskEntity, task);
      this.logger.log(`moveTask: task id=${dto.task_id} moved successfully`);
      return updated;
    });
  }

  async commit(id: number, today: string): Promise<TaskEntity> {
    this.logger.log(`commit: task id=${id} today=${today}`);

    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      this.logger.warn(`commit: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.committedOn = normalizeDueDate(today);
    const saved = await this.tasksRepo.save(task);
    this.logger.log(`commit: task id=${id} committed_on=${saved.committedOn?.toISOString()}`);
    return saved;
  }

  async uncommit(id: number): Promise<TaskEntity> {
    this.logger.log(`uncommit: task id=${id}`);

    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      this.logger.warn(`uncommit: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.committedOn = null;
    const saved = await this.tasksRepo.save(task);
    this.logger.log(`uncommit: task id=${id} committed_on cleared`);
    return saved;
  }

  async complete(id: number): Promise<TaskEntity> {
    this.logger.log(`complete: task id=${id}`);

    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      this.logger.warn(`complete: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.completedAt = new Date();
    const saved = await this.tasksRepo.save(task);
    this.logger.log(`complete: task id=${id} completed_at=${saved.completedAt!.toISOString()}`);
    return saved;
  }

  async uncomplete(id: number): Promise<TaskEntity> {
    this.logger.log(`uncomplete: task id=${id}`);

    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) {
      this.logger.warn(`uncomplete: task id=${id} not found`);
      throw new NotFoundException(`Task with id '${id}' not found`);
    }

    task.completedAt = null;
    const saved = await this.tasksRepo.save(task);
    this.logger.log(`uncomplete: task id=${id} completed_at cleared`);
    return saved;
  }

  async listToday(today: string): Promise<(TaskEntity & { carried_days: number })[]> {
    this.logger.log(`listToday: today=${today}`);

    const noon = normalizeDueDate(today);

    const tasks = await this.tasksRepo
      .createQueryBuilder('task')
      .where('task.committed_on IS NOT NULL')
      .andWhere('task.committed_on <= :noon', { noon: noon.toISOString() })
      .andWhere('task.completed_at IS NULL')
      .andWhere('task.archived_at IS NULL')
      .orderBy('task.committed_on', 'ASC')
      .addOrderBy('task.position', 'ASC')
      .getMany();

    this.logger.log(`listToday: found ${tasks.length} tasks`);

    return tasks.map((task) => {
      // Parse both dates as UTC calendar days (DST-safe)
      const committedStr = new Date(task.committedOn!).toISOString().slice(0, 10);
      const [cYear, cMonth, cDay] = committedStr.split('-').map(Number) as [number, number, number];
      const [tYear, tMonth, tDay] = today.split('-').map(Number) as [number, number, number];
      const carriedDays = Math.round(
        (Date.UTC(tYear, tMonth - 1, tDay) - Date.UTC(cYear, cMonth - 1, cDay)) / 86_400_000,
      );

      return Object.assign(task, { carried_days: carriedDays });
    });
  }

  async permanentDelete(id: number): Promise<void> {
    this.logger.log(`permanentDelete: attempting hard delete task id=${id}`);

    return this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(TaskEntity, { where: { id } });
      if (!task) {
        this.logger.warn(`permanentDelete: task id=${id} not found`);
        throw new NotFoundException(`Task with id '${id}' not found`);
      }

      if (!task.archivedAt) {
        this.logger.warn(
          `permanentDelete: task id=${id} is not archived — cannot permanently delete`,
        );
        throw new ConflictException({
          code: 'NOT_ARCHIVED',
          message: 'Task must be archived before permanent deletion',
        });
      }

      await this.fileRefsService.deleteAllFor('task', id, manager);
      await manager.remove(TaskEntity, task);
      this.logger.log(`permanentDelete: task id=${id} hard deleted`);
    });
  }
}
