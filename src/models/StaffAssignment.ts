import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffAssignment extends Document {
  id: string;
  staffId: string;
  staffName: string;
  department: string;
  academicYear: string;
  assignedBy: string;
  assignedAt: Date;
  status: string;
}

const StaffAssignmentSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    staffId: { type: String, required: true, uppercase: true, trim: true, index: true },
    staffName: { type: String, required: true, trim: true },
    department: { type: String, required: true, uppercase: true, trim: true, index: true },
    academicYear: { type: String, required: true, trim: true, index: true },
    assignedBy: { type: String, required: true, trim: true },
    assignedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

StaffAssignmentSchema.index({ staffId: 1, department: 1, academicYear: 1 });

export const StaffAssignmentModel =
  mongoose.models.StaffAssignment || mongoose.model<IStaffAssignment>('StaffAssignment', StaffAssignmentSchema);
