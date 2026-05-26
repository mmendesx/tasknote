import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { FileRefsModule } from '../file-refs/file-refs.module';

@Module({
  imports: [TypeOrmModule.forFeature([NoteEntity, TaskEntity]), FileRefsModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
