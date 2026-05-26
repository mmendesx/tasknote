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
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import * as shared from '@tasknote/shared';
import { BoardsService } from './boards.service';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listBoards() {
    return this.boardsService.listBoards();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateBoardDtoSchema))
  createBoard(@Body() dto: shared.CreateBoardDto) {
    return this.boardsService.createBoard(dto);
  }

  @Get(':id')
  getBoard(@Param('id', ParseIntPipe) id: number) {
    return this.boardsService.getBoard(id);
  }

  @Patch(':id')
  updateBoard(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateBoardDtoSchema)) dto: shared.UpdateBoardDto,
  ) {
    return this.boardsService.updateBoard(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBoard(@Param('id', ParseIntPipe) id: number) {
    return this.boardsService.removeBoard(id);
  }
}
