import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server.js';
import { connectToMongoDB } from '../src/server/mongo.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (process.env.MONGODB_URI) {
    try {
      await connectToMongoDB();
    } catch (err) {
      console.error('MongoDB connection error in Vercel serverless function:', err);
    }
  }
  return app(req, res);
}
