import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagramEntity } from './entities/diagram.entity';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DiagramEntity])],
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}
