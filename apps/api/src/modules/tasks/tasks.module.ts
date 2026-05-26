import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity } from './entities/task.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { FileRefsModule } from '../file-refs/file-refs.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity, ColumnEntity]), FileRefsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
