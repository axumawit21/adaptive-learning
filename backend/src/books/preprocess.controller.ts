import { Controller, Post, Param, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PreprocessService } from './preprocess.service';

@Controller('preprocess')
export class PreprocessController {
  private readonly logger = new Logger(PreprocessController.name);

  constructor(private readonly preprocessService: PreprocessService) {}

  /**
   * POST /preprocess/:bookId
   * Trigger preprocessing for a book by its MongoDB ID
   */
  @Post(':bookId')
  async preprocessBook(@Param('bookId') bookId: string) {
    try {
      const result = await this.preprocessService.preprocessBook(bookId);
      return {
        status: 'success',
        data: result,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to preprocess book ${bookId}`, error as any);
      throw new HttpException(
        { status: 'error', message: (error as Error).message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}