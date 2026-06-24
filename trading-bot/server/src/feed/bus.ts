import { EventEmitter } from 'node:events';

/**
 * In-process event bus that fans out live events to SSE clients and any
 * internal listeners. Every meaningful thing the bot does is published here.
 */
export type FeedEventType =
  | 'webhook'
  | 'candidate'
  | 'decision'
  | 'order'
  | 'risk'
  | 'news'
  | 'state'
  | 'error'
  | 'log';

export interface FeedEvent {
  type: FeedEventType;
  at: string;
  message: string;
  data?: unknown;
}

class FeedBus extends EventEmitter {
  emitEvent(type: FeedEventType, message: string, data?: unknown): FeedEvent {
    const evt: FeedEvent = { type, at: new Date().toISOString(), message, data };
    this.emit('event', evt);
    return evt;
  }
}

export const bus = new FeedBus();
// Avoid MaxListeners warnings when many SSE clients connect.
bus.setMaxListeners(100);
