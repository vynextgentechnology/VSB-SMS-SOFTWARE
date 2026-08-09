import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  staffId: string;
  name: string;
  department: string;
  phoneNumber: string;
  permissions: string[];
  createdAt: Date;
}

const StaffSchema: Schema = new Schema({
  staffId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, trim: true },
  permissions: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

export const StaffModel = mongoose.models.Staff || mongoose.model<IStaff>('Staff', StaffSchema);
