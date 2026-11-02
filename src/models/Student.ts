import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  name: string;
  registerNumber: string;
  department: string;
  academicYear: string;
  year?: string;
  section?: string;
  phoneNumber: string;
  parentMobile?: string;
  studentMobile?: string;
  email?: string;
  gender?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const StudentSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    registerNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    department: { type: String, required: true, trim: true, uppercase: true, index: true },
    academicYear: { type: String, required: true, default: '1st Year', trim: true, index: true },
    year: { type: String, default: '1st Year', trim: true },
    section: { type: String, default: '', trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    parentMobile: { type: String, default: '', trim: true },
    studentMobile: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    gender: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

StudentSchema.index({ department: 1, academicYear: 1 });

export const StudentModel = mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);

