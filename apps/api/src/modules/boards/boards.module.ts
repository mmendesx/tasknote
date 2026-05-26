import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardEntity } from './entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { FileRefsModule } from '../file-refs/file-refs.module';

@Module({
  imports: [TypeOrmModule.forFeature([BoardEntity, ColumnEntity, TaskEntity]), FileRefsModule],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
