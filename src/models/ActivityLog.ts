import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  id: string;
  action: string;
  details: string;
  user: string;
  type: string;
  timestamp: Date;
}

const ActivityLogSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  action: { type: String, required: true },
  details: { type: String, required: true },
  user: { type: String, required: true },
  type: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export const ActivityLogModel =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
