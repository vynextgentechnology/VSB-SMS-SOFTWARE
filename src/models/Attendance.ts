import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceRecord {
  studentId?: string;
  registerNumber: string;
  studentName: string;
  department: string;
  status: 'PRESENT' | 'ABSENT';
  parentMobile?: string;
  parentName?: string;
  parentMatched: boolean;
  smsSent: boolean;
  smsSentAt?: string;
  smsStatus?: 'Sent' | 'Failed' | 'Pending';
  smsErrorMessage?: string;
}

export interface IAttendanceSession extends Document {
  id: string;
  title?: string;
  department: string;
  date: string;
  academicGroup: string;
  section?: string;
  sessionType?: string;
  records: IAttendanceRecord[];
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  smsSentCount: number;
  takenBy: string;
  takenByName: string;
  takenByRole: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRecordSchema = new Schema(
  {
    studentId: { type: String },
    registerNumber: { type: String, required: true, trim: true, uppercase: true },
    studentName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT'], required: true, default: 'PRESENT' },
    parentMobile: { type: String, default: '' },
    parentName: { type: String, default: '' },
    parentMatched: { type: Boolean, default: false },
    smsSent: { type: Boolean, default: false },
    smsSentAt: { type: String },
    smsStatus: { type: String, enum: ['Sent', 'Failed', 'Pending'] },
    smsErrorMessage: { type: String },
  },
  { _id: false }
);

const AttendanceSessionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: '' },
    department: { type: String, required: true, uppercase: true, index: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    academicGroup: { type: String, required: true, trim: true },
    section: { type: String, default: '' },
    sessionType: { type: String, default: 'Full Day' },
    records: [AttendanceRecordSchema],
    totalStudents: { type: Number, required: true, default: 0 },
    presentCount: { type: Number, required: true, default: 0 },
    absentCount: { type: Number, required: true, default: 0 },
    smsSentCount: { type: Number, required: true, default: 0 },
    takenBy: { type: String, required: true },
    takenByName: { type: String, default: 'Staff' },
    takenByRole: { type: String, default: 'staff' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const AttendanceModel =
  mongoose.models.AttendanceSession ||
  mongoose.model<IAttendanceSession>('AttendanceSession', AttendanceSessionSchema);
