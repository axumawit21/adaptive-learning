
import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Student, StudentSchema } from './student.schema';
import { StudentsService } from './students.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Student.name, schema: StudentSchema }]),
  ],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [MongooseModule],
})
export class StudentsModule {}
