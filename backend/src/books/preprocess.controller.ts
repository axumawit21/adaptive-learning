import { Controller, Param, Post } from '@nestjs/common';
import { PreprocessService } from './preprocess.service';

@Controller('preprocess')
export class PreprocessController {
  constructor(private readonly preprocessService: PreprocessService) {}

  @Post(':bookId')
  async preprocessBook(@Param('bookId') bookId: string) {
    await this.preprocessService.processBook(bookId);
    return { message: '✅ Preprocessing complete', bookId };
  }
}
