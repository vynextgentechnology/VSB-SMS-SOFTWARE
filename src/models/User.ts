import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  id?: string;
  userId: string;
  username?: string;
  name: string;
  role: string;
  department?: string;
  assignedYears?: string[];
  assignedDepartments?: string[];
  phoneNumber?: string;
  email?: string;
  status?: string;
  passwordHash: string;
  rawPassword?: string;
  permissions: string[];
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  id: { type: String },
  userId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  department: { type: String, default: 'General', trim: true },
  assignedYears: [{ type: String, trim: true }],
  assignedDepartments: [{ type: String, trim: true, uppercase: true }],
  phoneNumber: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  passwordHash: { type: String, required: true },
  rawPassword: { type: String, default: '' },
  permissions: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);


