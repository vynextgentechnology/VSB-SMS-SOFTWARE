import mongoose, { Schema, Document } from 'mongoose';

export interface IPromotionDetail {
  fromYear: string;
  toYear: string;
  department: string;
  count: number;
  registerNumbers?: string[];
}

export interface IPromotedStudentRecord {
  studentName: string;
  registerNumber: string;
  department: string;
  fromYear: string;
  toYear: string;
  promotedBy: string;
  promotedByName?: string;
  promotionDate: string;
  status: string;
  errorReason?: string;
}

export interface IAcademicPromotionHistory extends Document {
  id: string;
  academicSession: string;
  promotedBy: string;
  promotedByName: string;
  totalStudentsPromoted: number;
  promotions: IPromotionDetail[];
  studentRecords?: IPromotedStudentRecord[];
  notes?: string;
  timestamp: Date;
}

const PromotionDetailSchema = new Schema(
  {
    fromYear: { type: String, required: true },
    toYear: { type: String, required: true },
    department: { type: String, required: true },
    count: { type: Number, required: true },
    registerNumbers: [{ type: String }],
  },
  { _id: false }
);

const PromotedStudentRecordSchema = new Schema(
  {
    studentName: { type: String, required: true },
    registerNumber: { type: String, required: true },
    department: { type: String, required: true },
    fromYear: { type: String, required: true },
    toYear: { type: String, required: true },
    promotedBy: { type: String, required: true },
    promotedByName: { type: String, default: '' },
    promotionDate: { type: String, default: '' },
    status: { type: String, default: 'SUCCESS' },
    errorReason: { type: String, default: '' },
  },
  { _id: false }
);

const AcademicPromotionHistorySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    academicSession: { type: String, required: true },
    promotedBy: { type: String, required: true },
    promotedByName: { type: String, required: true },
    totalStudentsPromoted: { type: Number, required: true, default: 0 },
    promotions: [PromotionDetailSchema],
    studentRecords: [PromotedStudentRecordSchema],
    notes: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const AcademicPromotionHistoryModel =
  mongoose.models.AcademicPromotionHistory ||
  mongoose.model<IAcademicPromotionHistory>('AcademicPromotionHistory', AcademicPromotionHistorySchema);
