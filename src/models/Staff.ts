import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  staffId: string;
  name: string;
  email?: string;
  department: string;
  assignedYears: string[];
  assignedDepartments: string[];
  phoneNumber: string;
  status: string;
  permissions: string[];
  createdAt: Date;
  updatedAt?: Date;
}

const StaffSchema: Schema = new Schema(
  {
    staffId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    department: { type: String, required: true, trim: true, uppercase: true },
    assignedYears: [{ type: String, trim: true }],
    assignedDepartments: [{ type: String, trim: true, uppercase: true }],
    phoneNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    permissions: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

StaffSchema.index({ department: 1, status: 1 });

export const StaffModel = mongoose.models.Staff || mongoose.model<IStaff>('Staff', StaffSchema);

