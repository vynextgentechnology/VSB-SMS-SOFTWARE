import mongoose, { Schema, Document } from 'mongoose';

export interface IExamBatch extends Document {
  id: string;
  title: string;
  resultType?: string;
  department: string;
  examDate: string;
  results: any[];
  uploadedAt: Date;
  uploadedBy: string;
  totalStudents: number;
  passedCount?: number;
  failedCount?: number;
  passRate?: number;
  smsSentCount: number;
  matchedCount: number;
  unmatchedCount: number;
  detectedSubjects?: string[];
}

const ExamBatchSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  resultType: { type: String, default: 'Semester Result' },
  department: { type: String, required: true },
  examDate: { type: String, required: true },
  results: { type: Schema.Types.Mixed, default: [] },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String, default: 'VSBEC' },
  totalStudents: { type: Number, default: 0 },
  passedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  passRate: { type: Number, default: 0 },
  smsSentCount: { type: Number, default: 0 },
  matchedCount: { type: Number, default: 0 },
  unmatchedCount: { type: Number, default: 0 },
  detectedSubjects: { type: [String], default: [] },
});

export const ExamBatchModel =
  mongoose.models.ExamBatch || mongoose.model<IExamBatch>('ExamBatch', ExamBatchSchema);
