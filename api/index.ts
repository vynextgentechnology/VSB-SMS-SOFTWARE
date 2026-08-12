import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server.js';
import { connectToMongoDB } from '../src/server/mongo.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure default JSON content type for API routes
  res.setHeader('Content-Type', 'application/json');

  // Preserve original request URL if rewritten by Vercel
  const originalUrl =
    (req.headers['x-forwarded-uri'] as string) ||
    (req.headers['x-original-url'] as string) ||
    (req.headers['x-invoke-path'] as string) ||
    req.url;

  if (originalUrl) {
    req.url = originalUrl;
  }

  // Ensure req.url starts with /api if missing
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }

  if (process.env.MONGODB_URI) {
    try {
      await connectToMongoDB();
    } catch (err) {
      console.error('MongoDB connection error in Vercel serverless function:', err);
    }
  }

  try {
    return app(req, res);
  } catch (err: any) {
    console.error('Vercel API handler error:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Internal server error in API function',
        error: err?.message || 'Server error',
      });
    }
  }
}
