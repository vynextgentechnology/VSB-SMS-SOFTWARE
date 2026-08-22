import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
  id: string;
  code: string;
  name: string;
  headOfDepartment?: string;
  createdAt: Date;
}

const DepartmentSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  headOfDepartment: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
});

export const DepartmentModel = mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);

