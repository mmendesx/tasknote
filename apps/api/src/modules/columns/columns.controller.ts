import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateColumnDtoSchema,
  UpdateColumnDtoSchema,
  ReorderColumnsDtoSchema,
  type CreateColumnDto,
  type UpdateColumnDto,
  type ReorderColumnsDto,
} from '@tasknote/shared';
import { ColumnsService } from './columns.service';
import { ColumnEntity } from './entities/column.entity';

@Controller('columns')
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(CreateColumnDtoSchema))
  @HttpCode(HttpStatus.CREATED)
  createColumn(@Body() dto: CreateColumnDto): Promise<ColumnEntity> {
    return this.columnsService.createColumn(dto);
  }

  @Post('reorder')
  @UsePipes(new ZodValidationPipe(ReorderColumnsDtoSchema))
  @HttpCode(HttpStatus.OK)
  reorderColumns(@Body() dto: ReorderColumnsDto): Promise<ColumnEntity[]> {
    return this.columnsService.reorderColumns(dto);
  }

  @Patch(':id')
  updateColumn(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateColumnDtoSchema)) dto: UpdateColumnDto,
  ): Promise<ColumnEntity> {
    return this.columnsService.updateColumn(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeColumn(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.columnsService.removeColumn(id);
  }
}
