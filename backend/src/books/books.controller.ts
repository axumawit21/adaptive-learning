import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Res,
  Body
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BooksService } from './books.service';
import * as path from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import { diskStorage } from 'multer';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          cb(null, `${Date.now()}-${file.originalname}`);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body() body: { subject: string; grade: string }) {
    try {
      if (!file) return { message: '❌ No file uploaded' };

      const fileUrl = `http://localhost:3000/books/${file.filename}`;
      const { subject, grade } = body;

      const savedBook = await this.booksService.create({
        title: file.originalname.replace('.pdf', ''),
        filePath: file.path,
        fileUrl,
        subject,
        grade,
        uploadedBy: 'admin',
      });

      return {
        message: '✅ File uploaded successfully!',
        book: savedBook,
      };
    } catch (error) {
      console.error('❌ Upload error:', error);
      return {
        message: '❌ Error uploading file',
        error: error.message || 'Unknown error',
      };
    }
  }

  @Get(':filename')
  getBook(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(__dirname, '..', '..', 'uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(filePath);
  }
}
