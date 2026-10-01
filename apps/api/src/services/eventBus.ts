import { INSTANCE_ID } from '../instanceId.js';

/**
 * In-memory, family-scoped event bus backing the SSE stream (GET /api/events).
 *
 * Single-process only: scaling out would need an external broker. Each family
 * keeps a ring buffer of its most recent events so a reconnecting client can
 * replay what it missed via Last-Event-ID.
 */

export interface BusEvent {
  /** `${instanceId}:${seq}` */
  id: string;
  type: string;
  data: unknown;
}

export type Subscriber = (event: BusEvent) => void;

export const DEFAULT_BUFFER_SIZE = 500;

export interface EventBus {
  publish(familyId: string, type: string, data: unknown): BusEvent;
  subscribe(familyId: string, fn: Subscriber): () => void;
  /** Events after `lastEventId`, or 'reset' if it cannot be resumed from. */
  since(familyId: string, lastEventId: string): BusEvent[] | 'reset';
  /** Drop all buffers, subscribers and the sequence counter (tests). */
  reset(): void;
  subscriberCount(familyId?: string): number;
}

interface Stored extends BusEvent {
  seq: number;
}

export function createEventBus(options: { instanceId?: string; capacity?: number } = {}): EventBus {
  const instanceId = options.instanceId ?? INSTANCE_ID;
  const capacity = options.capacity ?? DEFAULT_BUFFER_SIZE;
  const subscribers = new Map<string, Set<Subscriber>>();
  const buffers = new Map<string, Stored[]>();
  let seq = 0;

  return {
    publish(familyId, type, data) {
      seq += 1;
      const event: Stored = { id: `${instanceId}:${seq}`, seq, type, data };
      let buf = buffers.get(familyId);
      if (!buf) {
        buf = [];
        buffers.set(familyId, buf);
      }
      buf.push(event);
      if (buf.length > capacity) buf.splice(0, buf.length - capacity);

      const subs = subscribers.get(familyId);
      if (subs) {
        for (const fn of [...subs]) {
          try {
            fn(event);
          } catch {
            // A failing subscriber must not affect publishers or other subscribers.
          }
        }
      }
      return { id: event.id, type, data };
    },

    subscribe(familyId, fn) {
      let subs = subscribers.get(familyId);
      if (!subs) {
        subs = new Set();
        subscribers.set(familyId, subs);
      }
      subs.add(fn);
      return () => {
        const current = subscribers.get(familyId);
        if (!current) return;
        current.delete(fn);
        if (current.size === 0) subscribers.delete(familyId);
      };
    },

    since(familyId, lastEventId) {
      const sep = lastEventId.lastIndexOf(':');
      if (sep < 0 || lastEventId.slice(0, sep) !== instanceId) return 'reset';
      const lastSeq = Number(lastEventId.slice(sep + 1));
      if (!Number.isInteger(lastSeq)) return 'reset';
      const buf = buffers.get(familyId);
      if (!buf) return 'reset';
      const idx = buf.findIndex((e) => e.seq === lastSeq);
      // Not in this family's buffer: aged out (or never ours), so a replay would be incomplete.
      if (idx < 0) return 'reset';
      return buf.slice(idx + 1).map(({ id, type, data }) => ({ id, type, data }));
    },

    reset() {
      subscribers.clear();
      buffers.clear();
      seq = 0;
    },

    subscriberCount(familyId) {
      if (familyId !== undefined) return subscribers.get(familyId)?.size ?? 0;
      let n = 0;
      for (const s of subscribers.values()) n += s.size;
      return n;
    },
  };
}

/** Process-wide bus. */
export const eventBus = createEventBus();

export const publish = eventBus.publish.bind(eventBus);
export const subscribe = eventBus.subscribe.bind(eventBus);
export const since = eventBus.since.bind(eventBus);
export const resetEventBus = eventBus.reset.bind(eventBus);
