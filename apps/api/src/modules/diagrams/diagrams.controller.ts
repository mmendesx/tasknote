import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import * as shared from '@tasknote/shared';
import { DiagramsService } from './diagrams.service';

@Controller('diagrams')
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) {}

  @Get()
  listDiagrams() {
    return this.diagramsService.listDiagrams();
  }

  @Get(':id')
  getDiagram(@Param('id', ParseIntPipe) id: number) {
    return this.diagramsService.getDiagram(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createDiagram(
    @Body(new ZodValidationPipe(shared.CreateDiagramDtoSchema)) dto: shared.CreateDiagramDto,
  ) {
    return this.diagramsService.createDiagram(dto);
  }

  @Patch(':id')
  updateDiagram(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateDiagramDtoSchema)) dto: shared.UpdateDiagramDto,
  ) {
    return this.diagramsService.updateDiagram(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDiagram(@Param('id', ParseIntPipe) id: number) {
    return this.diagramsService.deleteDiagram(id);
  }
}
