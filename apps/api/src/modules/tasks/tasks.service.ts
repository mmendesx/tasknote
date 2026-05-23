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

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
    @InjectRepository(ColumnEntity)
    private readonly columnsRepo: Repository<ColumnEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── create ──────────────────────────────────────────────────────────────────

  async createTask(dto: CreateTaskDto): Promise<TaskEntity> {
    this.logger.log(`createTask: column_id=${dto.column_id} title="${dto.title}"`);

    return this.dataSource.transaction(async (manager) => {
      // Verify the target column exists
      const column = await manager.findOne(ColumnEntity, { where: { id: dto.column_id } });
      if (!column) {
        this.logger.warn(`createTask: column id=${dto.column_id} not found`);
        throw new NotFoundException(`Column with id '${dto.column_id}' not found`);
      }

      // Compute position = max(position)+1 within the column
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
        dueDate: dto.due_date ? new Date(dto.due_date) : null,
        position: nextPosition,
      });

      const saved = await manager.save(TaskEntity, task);
      this.logger.log(`createTask: created task id=${saved.id}`);
      return saved;
    });
  }

  // ─── getOne ──────────────────────────────────────────────────────────────────

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

  // ─── update ──────────────────────────────────────────────────────────────────

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

      // Validate new column when column_id is changing
      if (isColumnChanging) {
        const newColumn = await manager.findOne(ColumnEntity, {
          where: { id: dto.column_id },
        });
        if (!newColumn) {
          this.logger.warn(`updateTask: new column id=${dto.column_id} not found`);
          throw new NotFoundException(`Column with id '${dto.column_id}' not found`);
        }

        // Load old column to check is_done for completed_at toggle
        const oldColumn = await manager.findOne(ColumnEntity, {
          where: { id: task.columnId },
        });

        // Apply completed_at logic: same semantics as move endpoint
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

        // Set position to max+1 in the new column when column changes via PATCH
        const result = await manager
          .createQueryBuilder(TaskEntity, 't')
          .select('MAX(t.position)', 'maxPos')
          .where('t.column_id = :columnId', { columnId: dto.column_id })
          .getRawOne<{ maxPos: number | null }>();

        task.position = (result?.maxPos ?? -1) + 1;
        task.columnId = dto.column_id!;
      }

      // Apply remaining scalar updates
      if (dto.title !== undefined) task.title = dto.title;
      if (dto.description_md !== undefined) task.descriptionMd = dto.description_md ?? null;
      if (dto.priority !== undefined) task.priority = dto.priority;
      if (dto.due_date !== undefined) {
        task.dueDate = dto.due_date ? new Date(dto.due_date) : null;
      }

      const updated = await manager.save(TaskEntity, task);
      this.logger.log(`updateTask: task id=${id} updated`);
      return updated;
    });
  }

  // ─── softDelete ──────────────────────────────────────────────────────────────

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

  // ─── restore ─────────────────────────────────────────────────────────────────

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

  // ─── move ────────────────────────────────────────────────────────────────────

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
        // Load old column to determine completed_at toggle
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

  // ─── permanentDelete ─────────────────────────────────────────────────────────

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

      await manager.remove(TaskEntity, task);
      this.logger.log(`permanentDelete: task id=${id} hard deleted`);
    });
  }
}
