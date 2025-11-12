import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Book } from './book.schema';

@Injectable()
export class BooksService {
  constructor(@InjectModel(Book.name) private bookModel: Model<Book>) {}

  async create(data: any): Promise<Book> {
    const book = new this.bookModel(data);
    return book.save();
  }

  async findAll(): Promise<Book[]> {
    return this.bookModel.find().sort({ createdAt: -1 });
  }
}