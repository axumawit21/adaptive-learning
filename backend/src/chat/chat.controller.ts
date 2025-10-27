import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('ask')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async ask(@Body('question') question: string) {
    if (!question) {
      return { message: 'Please provide a question in the "question" field' };
    }
    try {
      const res = await this.chatService.ask(question);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, message: 'Error answering question', error: err.message || err };
    }
  }
}