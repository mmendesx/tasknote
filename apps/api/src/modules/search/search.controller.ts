import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/search?q=<query>
   *
   * Returns results grouped by type: tasks, notes, and file references.
   * Each group is capped at 20 results. An absent or empty `q` returns
   * empty groups without issuing any database queries.
   */
  @Get()
  search(@Query('q') q = '') {
    return this.searchService.search(q);
  }
}
