import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColumnEntity } from './entities/column.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { ColumnsService } from './columns.service';
import { ColumnsController } from './columns.controller';
import { FileRefsModule } from '../file-refs/file-refs.module';

@Module({
  imports: [TypeOrmModule.forFeature([ColumnEntity, BoardEntity, TaskEntity]), FileRefsModule],
  providers: [ColumnsService],
  controllers: [ColumnsController],
  exports: [ColumnsService],
})
export class ColumnsModule {}
