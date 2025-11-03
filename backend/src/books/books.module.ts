import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { Book, BookSchema } from './book.schema';
import { PreprocessService } from './preprocess.service';
import { qdrantProvider } from '../common/qdrant.provider';
import { PreprocessController } from './preprocess.controller';


@Module({
  imports: [MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }])],
  controllers: [BooksController, PreprocessController],
  providers: [BooksService, PreprocessService, qdrantProvider],
  exports: [PreprocessService],
})
export class BooksModule {}