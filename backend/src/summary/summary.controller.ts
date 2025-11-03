import { Body, Controller, Post, Param } from '@nestjs/common';
import { SummarizeService } from './summary.service';

@Controller('summarize')
export class SummarizeController {
  constructor(private readonly summarizeService: SummarizeService) {}

  @Post(':bookId')
  async summarizeChapter(
    @Param('bookId') bookId: string,
    @Body('chapter') chapter: string,
  ) {
    if (!chapter) {
      return { message: 'Please provide a "chapter" in the request body' };
    }

    return this.summarizeService.summarizeBook(bookId, chapter);
  }
}
