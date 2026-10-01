import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../services/eventBus.js';

describe('eventBus', () => {
  it('publishes with no subscribers without throwing', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const e = bus.publish('fam', 'x', { a: 1 });
    expect(e).toEqual({ id: 'i1:1', type: 'x', data: { a: 1 } });
  });

  it('assigns monotonic ids and delivers only to the same family', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('fam-a', a);
    bus.subscribe('fam-b', b);
    bus.publish('fam-a', 'one', 1);
    bus.publish('fam-a', 'two', 2);
    expect(a.mock.calls.map((c) => c[0].id)).toEqual(['i1:1', 'i1:2']);
    expect(b).not.toHaveBeenCalled();
  });

  it('unsubscribe stops delivery and cleans up the family entry', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const fn = vi.fn();
    const off = bus.subscribe('fam', fn);
    expect(bus.subscriberCount('fam')).toBe(1);
    off();
    off(); // idempotent
    expect(bus.subscriberCount()).toBe(0);
    bus.publish('fam', 'x', 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a throwing subscriber does not block others or the publisher', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const ok = vi.fn();
    bus.subscribe('fam', () => {
      throw new Error('boom');
    });
    bus.subscribe('fam', ok);
    expect(() => bus.publish('fam', 'x', 1)).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('since replays events after the given id', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const e1 = bus.publish('fam', 'a', 1);
    bus.publish('other', 'noise', 0);
    bus.publish('fam', 'b', 2);
    bus.publish('fam', 'c', 3);
    const out = bus.since('fam', e1.id);
    expect(out).not.toBe('reset');
    expect((out as { type: string }[]).map((e) => e.type)).toEqual(['b', 'c']);
  });

  it('since returns an empty list when the client is up to date', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const e = bus.publish('fam', 'a', 1);
    expect(bus.since('fam', e.id)).toEqual([]);
  });

  it('evicts the oldest events beyond capacity and resets for aged-out ids', () => {
    const bus = createEventBus({ instanceId: 'i1', capacity: 3 });
    const ids = [1, 2, 3, 4, 5].map((n) => bus.publish('fam', 'e', n).id);
    // Buffer now holds seq 3..5.
    expect(bus.since('fam', ids[0])).toBe('reset');
    expect(bus.since('fam', ids[1])).toBe('reset');
    expect((bus.since('fam', ids[2]) as unknown[]).length).toBe(2);
  });

  it('resets for another instance, malformed ids and unknown families', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    bus.publish('fam', 'a', 1);
    expect(bus.since('fam', 'other-instance:1')).toBe('reset');
    expect(bus.since('fam', 'garbage')).toBe('reset');
    expect(bus.since('fam', 'i1:abc')).toBe('reset');
    expect(bus.since('nobody', 'i1:1')).toBe('reset');
  });

  it('reset clears buffers, subscribers and the sequence', () => {
    const bus = createEventBus({ instanceId: 'i1' });
    const fn = vi.fn();
    bus.subscribe('fam', fn);
    bus.publish('fam', 'a', 1);
    bus.reset();
    expect(bus.subscriberCount()).toBe(0);
    expect(bus.publish('fam', 'a', 1).id).toBe('i1:1');
    expect(fn).toHaveBeenCalledOnce();
  });
});
