import mongoose from 'mongoose';
import { config } from '../config.js';
import { bus } from '../feed/bus.js';

let connected = false;

/**
 * Connect to MongoDB. If it's unavailable we don't crash the bot — logging and
 * the live dashboard still work; persistence is just disabled until it's back.
 */
export async function connectMongo(): Promise<boolean> {
  try {
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDb,
      // Fail fast if Mongo is down so the bot boots without persistence.
      serverSelectionTimeoutMS: 3000,
    });
    connected = true;
    bus.emitEvent('log', 'Connected to MongoDB.');
    return true;
  } catch (err) {
    connected = false;
    bus.emitEvent(
      'error',
      `MongoDB unavailable (${(err as Error).message}). Running without persistence.`,
    );
    return false;
  }
}

export function isMongoConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}
