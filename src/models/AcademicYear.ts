import mongoose, { Schema, Document } from 'mongoose';

export interface IAcademicYear extends Document {
  id: string;
  name: string; // '1st Year', '2nd Year', '3rd Year', '4th Year'
  code: string; // '1', '2', '3', '4'
  order: number;
  isActive: boolean;
  createdAt: Date;
}

const AcademicYearSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  order: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const AcademicYearModel =
  mongoose.models.AcademicYear || mongoose.model<IAcademicYear>('AcademicYear', AcademicYearSchema);
