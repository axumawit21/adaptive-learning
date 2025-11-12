import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Student extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  password: string; // hashed later

  @Prop({ default: 'student' })
  role: string;

  @Prop({ default: () => `STU-${Date.now()}` })
  studentId: string;
}

export const StudentSchema = SchemaFactory.createForClass(Student);