import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagEntity } from './entities/tag.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { TagsService } from './tags.service';
import { TagsController, TaskTagsController } from './tags.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TagEntity, TaskEntity])],
  controllers: [TagsController, TaskTagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
