import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRefEntity } from './entities/file-ref.entity';
import { FileRefsService } from './file-refs.service';
import { FileRefsController } from './file-refs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FileRefEntity])],
  controllers: [FileRefsController],
  providers: [FileRefsService],
  exports: [FileRefsService],
})
export class FileRefsModule {}
