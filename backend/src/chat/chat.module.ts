import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Book, BookSchema } from '../books/book.schema';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { redisProvider } from '../common/redis.provider';
import { qdrantProvider } from '../common/qdrant.provider';


 

@Module({
  imports: [MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }])] ,
  controllers: [ChatController],
  providers: [ChatService, redisProvider, qdrantProvider],
})
export class ChatModule {}