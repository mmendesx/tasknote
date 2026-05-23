import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { CreateBoardDto, UpdateBoardDto } from '@tasknote/shared';
import { BoardEntity } from './entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';

interface DefaultColumnSeed {
  name: string;
  color: string;
  isDone: boolean;
  position: number;
}

const DEFAULT_COLUMNS: DefaultColumnSeed[] = [
  { name: 'Backlog', color: '#5B616B', isDone: false, position: 0 },
  { name: 'Doing', color: '#F5C26B', isDone: false, position: 1 },
  { name: 'Blocked', color: '#F87171', isDone: false, position: 2 },
  { name: 'Done', color: '#A3E635', isDone: true, position: 3 },
];

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    @InjectRepository(BoardEntity)
    private readonly boardsRepo: Repository<BoardEntity>,
    @InjectRepository(ColumnEntity)
    private readonly columnsRepo: Repository<ColumnEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepo: Repository<TaskEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listBoards(): Promise<BoardEntity[]> {
    this.logger.log('listBoards: fetching all boards ordered by position asc');
    return this.boardsRepo.find({ order: { position: 'ASC' } });
  }

  async createBoard(dto: CreateBoardDto): Promise<BoardEntity & { columns: ColumnEntity[] }> {
    this.logger.log(`createBoard: creating board name="${dto.name}"`);

    return this.dataSource.transaction(async (manager) => {
      // Compute next position from current max
      const result = await manager
        .createQueryBuilder(BoardEntity, 'b')
        .select('MAX(b.position)', 'maxPos')
        .getRawOne<{ maxPos: number | null }>();

      const maxPos = result?.maxPos ?? -1;
      const nextPosition = maxPos + 1;

      this.logger.log(
        `createBoard: current max position=${maxPos}, assigning position=${nextPosition}`,
      );

      const board = manager.create(BoardEntity, {
        name: dto.name,
        position: nextPosition,
      });
      const savedBoard = await manager.save(BoardEntity, board);

      // Auto-create 4 default columns in a single batch
      const columnEntities = DEFAULT_COLUMNS.map((col) =>
        manager.create(ColumnEntity, {
          boardId: savedBoard.id,
          name: col.name,
          color: col.color,
          isDone: col.isDone,
          position: col.position,
        }),
      );
      const savedColumns = await manager.save(ColumnEntity, columnEntities);

      this.logger.log(
        `createBoard: created board id=${savedBoard.id} with ${savedColumns.length} default columns`,
      );

      return { ...savedBoard, columns: savedColumns };
    });
  }

  async getBoard(id: number): Promise<BoardEntity> {
    this.logger.log(`getBoard: loading board id=${id} with nested columns and tasks`);

    // Single query via joins. Archived tasks are excluded from the join condition
    // (not WHERE) so columns with zero active tasks are still returned.
    const board = await this.dataSource
      .createQueryBuilder(BoardEntity, 'board')
      .leftJoinAndSelect('board.columns', 'col')
      .leftJoinAndSelect('col.tasks', 'task', 'task.archived_at IS NULL')
      .where('board.id = :id', { id })
      .orderBy('col.position', 'ASC')
      .addOrderBy('task.position', 'ASC')
      .getOne();

    if (!board) {
      this.logger.warn(`getBoard: board id=${id} not found`);
      throw new NotFoundException(`Board with id '${id}' not found`);
    }

    return board;
  }

  async updateBoard(id: number, dto: UpdateBoardDto): Promise<BoardEntity> {
    this.logger.log(`updateBoard: updating board id=${id}`);

    const board = await this.boardsRepo.findOne({ where: { id } });
    if (!board) {
      this.logger.warn(`updateBoard: board id=${id} not found`);
      throw new NotFoundException(`Board with id '${id}' not found`);
    }

    Object.assign(board, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.position !== undefined && { position: dto.position }),
    });

    const updated = await this.boardsRepo.save(board);
    this.logger.log(`updateBoard: board id=${id} updated`);
    return updated;
  }

  async removeBoard(id: number): Promise<void> {
    this.logger.log(`removeBoard: attempting to delete board id=${id}`);

    const totalBoards = await this.boardsRepo.count();
    if (totalBoards <= 1) {
      this.logger.warn(
        `removeBoard: blocked — only ${totalBoards} board(s) exist, cannot delete the last board`,
      );
      throw new ConflictException({
        code: 'LAST_BOARD',
        message: 'At least one board must exist',
      });
    }

    const result = await this.boardsRepo.delete(id);
    if (result.affected === 0) {
      this.logger.warn(`removeBoard: board id=${id} not found`);
      throw new NotFoundException(`Board with id '${id}' not found`);
    }

    // FK ON DELETE CASCADE (columns.board_id, tasks.column_id) handles child rows.
    this.logger.log(`removeBoard: board id=${id} deleted (cascade removed columns and tasks)`);
  }
}
