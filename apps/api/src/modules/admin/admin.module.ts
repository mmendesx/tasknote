import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsEntity } from '../settings/entities/settings.entity';
import { BoardEntity } from '../boards/entities/board.entity';
import { ColumnEntity } from '../columns/entities/column.entity';
import { TaskEntity } from '../tasks/entities/task.entity';
import { NoteEntity } from '../notes/entities/note.entity';
import { TagEntity } from '../tags/entities/tag.entity';
import { FileRefEntity } from '../file-refs/entities/file-ref.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SettingsEntity,
      BoardEntity,
      ColumnEntity,
      TaskEntity,
      NoteEntity,
      TagEntity,
      FileRefEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
