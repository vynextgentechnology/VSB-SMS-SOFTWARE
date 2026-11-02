import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentModificationHistory extends Document {
  id: string;
  studentId?: string;
  registerNumber: string;
  studentName: string;
  department: string;
  academicYear: string;
  fieldName: string;
  previousValue: string;
  updatedValue: string;
  reason?: string;
  modifiedBy: string;
  modifiedByName: string;
  modifiedByRole: string;
  timestamp: Date;
}

const StudentModificationHistorySchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String },
    registerNumber: { type: String, required: true, uppercase: true, trim: true, index: true },
    studentName: { type: String, required: true, trim: true },
    department: { type: String, required: true, uppercase: true, trim: true, index: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    fieldName: { type: String, required: true, trim: true },
    previousValue: { type: String, default: '' },
    updatedValue: { type: String, default: '' },
    reason: { type: String, default: 'Staff/Admin Correction' },
    modifiedBy: { type: String, required: true, trim: true, index: true },
    modifiedByName: { type: String, required: true, trim: true },
    modifiedByRole: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

StudentModificationHistorySchema.index({ registerNumber: 1, timestamp: -1 });

export const StudentModificationHistoryModel =
  mongoose.models.StudentModificationHistory ||
  mongoose.model<IStudentModificationHistory>('StudentModificationHistory', StudentModificationHistorySchema);
