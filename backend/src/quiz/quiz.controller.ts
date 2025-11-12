import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { QuizService } from './quiz.service';

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /** Generate a new quiz */
  @Post('generate')
  async generateQuiz(
    @Body()
    body: { grade: string; subject: string; unit: string; topic: string; num_questions?: number, title?: string, bookId: string },
  ) {
    return await this.quizService.generateQuiz(body);
  }

  /** Get latest quiz for a topic */
  @Get('by-topic')
  async getQuizByTopic(@Query('subject') subject: string, @Query('topic') topic: string) {
    return await this.quizService.findQuizByTopic(subject, topic);
  }

  /** Get all quizzes */
  @Get('all')
  async getAllQuizzes() {
    return await this.quizService.findAllQuizzes();
  }
}