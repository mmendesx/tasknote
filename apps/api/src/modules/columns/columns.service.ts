import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { CreateColumnDto, UpdateColumnDto, ReorderColumnsDto } from '@tasknote/shared';
import { ColumnEntity } from './entities/column.entity';
import { BoardEntity } from '../boards/entities/board.entity';

@Injectable()
export class ColumnsService {
  private readonly logger = new Logger(ColumnsService.name);

  constructor(
    @InjectRepository(ColumnEntity)
    private readonly columnRepo: Repository<ColumnEntity>,
    @InjectRepository(BoardEntity)
    private readonly boardRepo: Repository<BoardEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createColumn(dto: CreateColumnDto): Promise<ColumnEntity> {
    const board = await this.boardRepo.findOne({ where: { id: dto.board_id } });
    if (!board) {
      throw new NotFoundException(`Board with ID ${dto.board_id} not found`);
    }

    // position = max current position within this board + 1
    const maxResult = await this.columnRepo
      .createQueryBuilder('col')
      .select('MAX(col.position)', 'max')
      .where('col.boardId = :boardId', { boardId: dto.board_id })
      .getRawOne<{ max: number | null }>();

    const nextPosition = (maxResult?.max ?? -1) + 1;

    const column = this.columnRepo.create({
      boardId: dto.board_id,
      name: dto.name,
      color: dto.color ?? '#5B616B',
      wipLimit: dto.wip_limit ?? null,
      isDone: dto.is_done ?? false,
      // Position is always server-assigned (max+1) — client value is ignored.
      position: nextPosition,
    });

    const saved = await this.columnRepo.save(column);
    this.logger.log(
      `Created column id=${saved.id} name="${saved.name}" boardId=${saved.boardId} position=${saved.position}`,
    );
    return saved;
  }

  async updateColumn(id: number, dto: UpdateColumnDto): Promise<ColumnEntity> {
    const column = await this.findColumnOrThrow(id);

    // WIP limit is stored server-side but enforcement is a soft UI-only warning.
    // The server accepts any positive integer or null — it never blocks task moves.
    if (dto.name !== undefined) column.name = dto.name;
    if (dto.color !== undefined) column.color = dto.color;
    if (dto.wip_limit !== undefined) column.wipLimit = dto.wip_limit;
    if (dto.is_done !== undefined) column.isDone = dto.is_done;

    const saved = await this.columnRepo.save(column);
    this.logger.log(`Updated column id=${id}`);
    return saved;
  }

  async removeColumn(id: number): Promise<void> {
    const column = await this.findColumnOrThrow(id);
    // Tasks cascade-delete via FK ON DELETE CASCADE (confirmed in migration).
    await this.columnRepo.remove(column);
    this.logger.log(`Deleted column id=${id} (tasks cascade-deleted by FK)`);
  }

  async reorderColumns(dto: ReorderColumnsDto): Promise<ColumnEntity[]> {
    const { board_id, column_ids } = dto;

    // Load all columns that currently belong to this board
    const existingColumns = await this.columnRepo.find({
      where: { boardId: board_id },
    });

    if (existingColumns.length === 0) {
      // Board may not exist — surface a clear error
      const boardExists = await this.boardRepo.exist({ where: { id: board_id } });
      if (!boardExists) {
        throw new NotFoundException(`Board with ID ${board_id} not found`);
      }
    }

    // Validate: array length must match the board's current column count
    if (column_ids.length !== existingColumns.length) {
      this.logger.warn(
        `Reorder rejected for boardId=${board_id}: ` +
          `sent ${column_ids.length} ids, board has ${existingColumns.length} columns`,
      );
      throw new BadRequestException({
        code: 'INVALID_REORDER',
        message: `column_ids must contain exactly ${existingColumns.length} id(s) matching the board's columns`,
      });
    }

    // Validate: no duplicate ids
    const uniqueIds = new Set(column_ids);
    if (uniqueIds.size !== column_ids.length) {
      throw new BadRequestException({
        code: 'INVALID_REORDER',
        message: 'column_ids must not contain duplicate values',
      });
    }

    // Validate: every id belongs to this board (membership check)
    const boardColumnIds = new Set(existingColumns.map((c) => c.id));
    for (const cid of column_ids) {
      if (!boardColumnIds.has(cid)) {
        throw new BadRequestException({
          code: 'INVALID_REORDER',
          message: `Column ID ${cid} does not belong to board ${board_id}`,
        });
      }
    }

    // Build a lookup map for quick access
    const columnById = new Map(existingColumns.map((c) => [c.id, c]));

    // Update positions atomically in a transaction so partial reorders never persist
    const updated = await this.dataSource.transaction(async (manager) => {
      const results: ColumnEntity[] = [];
      for (let i = 0; i < column_ids.length; i++) {
        const col = columnById.get(column_ids[i])!;
        col.position = i;
        const saved = await manager.save(ColumnEntity, col);
        results.push(saved);
      }
      return results;
    });

    this.logger.log(
      `Reordered ${updated.length} columns for boardId=${board_id}: [${column_ids.join(', ')}]`,
    );
    return updated;
  }

  private async findColumnOrThrow(id: number): Promise<ColumnEntity> {
    const column = await this.columnRepo.findOne({ where: { id } });
    if (!column) {
      throw new NotFoundException(`Column with ID ${id} not found`);
    }
    return column;
  }
}
