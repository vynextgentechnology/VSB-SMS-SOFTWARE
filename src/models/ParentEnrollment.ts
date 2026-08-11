import mongoose, { Schema, Document } from 'mongoose';

export interface IParentEnrollment extends Document {
  id: string;
  studentName: string;
  registerNumber: string;
  parentName: string;
  parentPhoneNumber: string;
  relationship: string;
  email?: string;
  createdAt: Date;
}

const ParentEnrollmentSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  studentName: { type: String, required: true, trim: true },
  registerNumber: { type: String, required: true, uppercase: true, trim: true },
  parentName: { type: String, required: true, trim: true },
  parentPhoneNumber: { type: String, required: true, trim: true },
  relationship: { type: String, default: 'Parent' },
  email: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export const ParentEnrollmentModel =
  mongoose.models.ParentEnrollment ||
  mongoose.model<IParentEnrollment>('ParentEnrollment', ParentEnrollmentSchema);
