import mongoose, { Schema, Document } from 'mongoose';

export interface ILoginLog extends Document {
  userId: string;
  name: string;
  role: 'admin' | 'hod' | 'staff';
  department?: string;
  action: 'login' | 'logout';
  ipAddress?: string;
  timestamp: Date;
}

const LoginLogSchema: Schema = new Schema({
  userId: { type: String, required: true, uppercase: true },
  name: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'hod', 'staff'] },
  department: { type: String, default: 'General' },
  action: { type: String, required: true, enum: ['login', 'logout'] },
  ipAddress: { type: String, default: '127.0.0.1' },
  timestamp: { type: Date, default: Date.now },
});

export const LoginLogModel = mongoose.models.LoginLog || mongoose.model<ILoginLog>('LoginLog', LoginLogSchema);
