import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  name: string;
  role: 'admin' | 'hod' | 'staff';
  department?: string;
  phoneNumber?: string;
  passwordHash: string;
  permissions: string[];
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  userId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, enum: ['admin', 'hod', 'staff'] },
  department: { type: String, default: 'General' },
  phoneNumber: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  permissions: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
