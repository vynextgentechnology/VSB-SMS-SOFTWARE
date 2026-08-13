import mongoose from 'mongoose';

interface CachedMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  lastError: string | null;
  lastFailedTime: number;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseConnection: CachedMongoose | undefined;
}

let cached = global.mongooseConnection;

if (!cached) {
  cached = global.mongooseConnection = {
    conn: null,
    promise: null,
    lastError: null,
    lastFailedTime: 0,
  };
}

const RETRY_COOL_DOWN_MS = 60000; // 60 seconds cool-down between connection retries on failure

export async function connectToMongoDB(): Promise<typeof mongoose | null> {
  const uri = process.env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    if (cached) cached.lastError = 'MONGODB_URI is not set';
    return null;
  }

  if (cached && cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If a previous connection attempt failed recently, bypass to avoid delaying requests and spamming connection attempts
  if (cached && cached.lastFailedTime > 0 && Date.now() - cached.lastFailedTime < RETRY_COOL_DOWN_MS) {
    return null;
  }

  if (!cached || !cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 2500, // Quick timeout to prevent UI lag
    };

    const promise = mongoose
      .connect(uri.trim(), opts)
      .then((m) => {
        console.log('[MongoDB Atlas]: Connected successfully');
        if (cached) {
          cached.lastError = null;
          cached.lastFailedTime = 0;
        }
        return m;
      })
      .catch((err) => {
        const msg = err.message || 'Could not connect to MongoDB Atlas cluster';
        console.warn(`[MongoDB Atlas Notice]: Atlas connection unavailable (${msg}). Using fast local database fallback.`);
        if (cached) {
          cached.promise = null;
          cached.conn = null;
          cached.lastError = msg;
          cached.lastFailedTime = Date.now();
        }
        return null;
      });

    if (cached) {
      cached.promise = promise;
    }
  }

  try {
    if (cached && cached.promise) {
      cached.conn = await cached.promise;
    }
  } catch (err: any) {
    if (cached) {
      cached.promise = null;
      cached.conn = null;
      cached.lastError = err?.message || 'Connection attempt failed';
      cached.lastFailedTime = Date.now();
    }
  }

  return cached ? cached.conn : null;
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getMongoDBConnectionDetails() {
  return {
    connected: isMongoDBConnected(),
    configured: !!(process.env.MONGODB_URI && process.env.MONGODB_URI.trim()),
    lastError: cached?.lastError || null,
    inCoolDown: !!(cached?.lastFailedTime && Date.now() - cached.lastFailedTime < RETRY_COOL_DOWN_MS),
  };
}

