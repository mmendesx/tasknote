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

  /** GET /api/boards — list all boards ordered by position asc */
  @Get()
  listBoards() {
    return this.boardsService.listBoards();
  }

  /** POST /api/boards — create a new board with 4 default columns */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(shared.CreateBoardDtoSchema))
  createBoard(@Body() dto: shared.CreateBoardDto) {
    return this.boardsService.createBoard(dto);
  }

  /** GET /api/boards/:id — board + nested columns (ordered by position) + non-archived tasks */
  @Get(':id')
  getBoard(@Param('id', ParseIntPipe) id: number) {
    return this.boardsService.getBoard(id);
  }

  /** PATCH /api/boards/:id — partial update */
  @Patch(':id')
  updateBoard(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(shared.UpdateBoardDtoSchema)) dto: shared.UpdateBoardDto,
  ) {
    return this.boardsService.updateBoard(id, dto);
  }

  /** DELETE /api/boards/:id — 409 LAST_BOARD when only one board exists */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBoard(@Param('id', ParseIntPipe) id: number) {
    return this.boardsService.removeBoard(id);
  }
}
