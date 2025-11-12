import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Student } from './student.schema';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<Student>,
  ) {}

  async create(createStudentDto: Partial<Student>): Promise<Student> {
    const createdStudent = new this.studentModel(createStudentDto);
    return createdStudent.save();
  }

  async findAll(): Promise<Student[]> {
    return this.studentModel.find().exec();
  }

  async findOne(id: string): Promise<Student | null> {
    return this.studentModel.findById(id).exec();
  }

  async findOneOrFail(id: string): Promise<Student> {
    const student = await this.findOne(id);
    if (!student) {
      throw new NotFoundException(`Student with ID "${id}" not found`);
    }
    return student;
  }

  async update(id: string, updateStudentDto: Partial<Student>): Promise<Student | null> {
    const updated = await this.studentModel
      .findByIdAndUpdate(id, updateStudentDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Student with ID "${id}" not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<Student | null> {
    const deleted = await this.studentModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Student with ID "${id}" not found`);
    }
    return deleted;
  }

  async findByEmail(email: string): Promise<Student | null> {
    return this.studentModel.findOne({ email }).exec();
  }
}