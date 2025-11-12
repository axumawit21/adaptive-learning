import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Book extends Document {
  
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
grade: string;

@Prop({ required: true })
subject: string;

  @Prop()
  content: string;

  @Prop()
  filePath: string;

  @Prop()
  fileUrl: string;

  @Prop({ default: 'admin' })
  uploadedBy: string; // later we can link to user

  @Prop({ default: [] })
  embeddings: number[]; // placeholder for future RAG
}

export const BookSchema = SchemaFactory.createForClass(Book);