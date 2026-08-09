import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  name: string;
  registerNumber: string;
  department: string;
  phoneNumber: string;
  createdAt: Date;
}

const StudentSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  registerNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  department: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

export const StudentModel = mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);
