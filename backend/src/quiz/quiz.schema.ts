import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Quiz extends Document {
  @Prop({ required: true })
  bookId: string;

  @Prop()
  chapter?: string;

  @Prop()
  subtopic?: string;

  @Prop({ type: Array })
  questions: any[];

  @Prop({ default: 'ai-generated' })
  source: string;
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);