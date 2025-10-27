import { Controller, Post, Body } from '@nestjs/common';

@Controller('quiz')
export class QuizController {
    @Post()
    generateQuiz(@Body() body: any) {
        return { message : 'POST /quiz generate a quiz' , data: body};
    }
}
