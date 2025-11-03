import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Book, BookSchema } from '../books/book.schema';
import { SummarizeService } from './summary.service';
import { SummarizeController } from './summary.controller';
import { qdrantProvider } from '../common/qdrant.provider';

@Module({
  imports: [MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }])],
  controllers: [SummarizeController],
  providers: [SummarizeService, qdrantProvider],
})
export class SummarizeModule {}
