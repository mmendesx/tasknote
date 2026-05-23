import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity, NoteEntity, FileRefEntity])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
