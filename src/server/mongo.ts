import mongoose from 'mongoose';

interface CachedMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseConnection: CachedMongoose | undefined;
}

let cached = global.mongooseConnection;

if (!cached) {
  cached = global.mongooseConnection = { conn: null, promise: null };
}

export async function connectToMongoDB(): Promise<typeof mongoose | null> {
  const uri = process.env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    return null;
  }

  if (cached && cached.conn) {
    return cached.conn;
  }

  if (!cached || !cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    const promise = mongoose
      .connect(uri.trim(), opts)
      .then((m) => {
        console.log('Successfully connected to MongoDB Atlas');
        return m;
      })
      .catch((err) => {
        console.error('MongoDB Atlas Connection Error:', err.message);
        if (cached) cached.promise = null;
        return null;
      });

    if (cached) {
      cached.promise = promise;
    }
  }

  try {
    if (cached) {
      cached.conn = await cached.promise;
    }
  } catch (err) {
    if (cached) cached.promise = null;
    console.error('Failed to establish MongoDB Atlas connection:', err);
  }

  return cached ? cached.conn : null;
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
