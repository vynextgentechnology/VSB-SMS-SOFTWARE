import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
  id: string;
  key: string;
  name: string;
  role: string;
  department: string;
  scopes: string[];
  status: 'active' | 'revoked';
  createdAt: Date;
  lastUsedAt?: string;
  description?: string;
}

const ApiKeySchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, default: 'staff' },
  department: { type: String, default: 'ALL' },
  scopes: [{ type: String }],
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: String, default: 'Never' },
  description: { type: String, default: '' },
});

export const ApiKeyModel =
  mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
