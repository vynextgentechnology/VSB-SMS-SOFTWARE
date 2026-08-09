import mongoose, { Schema, Document } from 'mongoose';

export interface ISmsLog extends Document {
  recipientName: string;
  registerNumber: string;
  phoneNumber: string;
  department: string;
  messageType: string;
  messageContent: string;
  channel: string;
  status: 'Sent' | 'Delivered' | 'Failed';
  sentBy: string;
  errorMessage?: string;
  sentAt: Date;
}

const SmsLogSchema: Schema = new Schema({
  recipientName: { type: String, required: true },
  registerNumber: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  department: { type: String, required: true },
  messageType: { type: String, required: true },
  messageContent: { type: String, required: true },
  channel: { type: String, default: 'SMS' },
  status: { type: String, enum: ['Sent', 'Delivered', 'Failed'], default: 'Sent' },
  sentBy: { type: String, required: true },
  errorMessage: { type: String },
  sentAt: { type: Date, default: Date.now },
});

export const SmsLogModel = mongoose.models.SmsLog || mongoose.model<ISmsLog>('SmsLog', SmsLogSchema);
