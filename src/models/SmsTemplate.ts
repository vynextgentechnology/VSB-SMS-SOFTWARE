import mongoose, { Schema, Document } from 'mongoose';

export interface ISmsTemplate extends Document {
  title: string;
  type: string;
  templateText: string;
  createdAt: Date;
}

const SmsTemplateSchema: Schema = new Schema({
  title: { type: String, required: true },
  type: { type: String, required: true },
  templateText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const SmsTemplateModel = mongoose.models.SmsTemplate || mongoose.model<ISmsTemplate>('SmsTemplate', SmsTemplateSchema);
