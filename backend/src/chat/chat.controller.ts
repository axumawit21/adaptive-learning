import { Body, Controller, Post, Param } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('ask')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':bookId')
  async ask(
    @Body('question') question: string,
    @Param('bookId') bookId: string,
  ) {
    if (!question || !bookId) {
      return { message: 'Please provide both "question" and "bookId"' };
    }

    try {
      const res = await this.chatService.ask(question, bookId);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, message: 'Error answering question', error: err.message || err };
    }
  }
}
