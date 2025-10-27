import { Controller, Post, Body } from '@nestjs/common';

@Controller('summary')
export class SummaryController {
    @Post()
    summarize(@Body() body: any) {
        return { message : 'POST /summary generate a summary' , data: body};
    }
}
