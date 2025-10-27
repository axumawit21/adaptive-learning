import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BooksModule } from './books/books.module';
import { StudentsModule } from './students/students.module';
import { ProgressModule } from './progress/progress.module';
import { ChatModule } from './chat/chat.module';
import { SummaryModule } from './summary/summary.module';
import { qdrantProvider } from './common/qdrant.provider';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    BooksModule,
    StudentsModule,
    ProgressModule,
    ChatModule,
    SummaryModule,
    
  ],
  providers: [qdrantProvider],
  controllers: [AppController],
  exports: [qdrantProvider],
})
export class AppModule {}
