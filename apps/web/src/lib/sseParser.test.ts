import { describe, it, expect } from 'vitest';
import { createSseParser, type SseFrame } from './sseParser';

function collect() {
  const frames: SseFrame[] = [];
  const retries: number[] = [];
  const parser = createSseParser({
    onFrame: (f) => frames.push(f),
    onRetry: (ms) => retries.push(ms),
  });
  return { frames, retries, parser };
}

describe('createSseParser', () => {
  it('parses id, event and data', () => {
    const { frames, parser } = collect();
    parser.push('id: a:1\nevent: grocery.check\ndata: {"x":1}\n\n');
    expect(frames).toEqual([{ id: 'a:1', event: 'grocery.check', data: '{"x":1}' }]);
  });

  it('joins multi-line data with newlines', () => {
    const { frames, parser } = collect();
    parser.push('data: one\ndata: two\ndata:three\n\n');
    expect(frames[0].data).toBe('one\ntwo\nthree');
    expect(frames[0].event).toBe('message');
  });

  it('ignores comments and heartbeats', () => {
    const { frames, parser } = collect();
    parser.push(': ping\n\n: another\nid: 2\nevent: e\ndata: d\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ id: '2', event: 'e', data: 'd' });
  });

  it('reports retry and does not dispatch a frame for it', () => {
    const { frames, retries, parser } = collect();
    parser.push('retry: 3000\n\n');
    expect(retries).toEqual([3000]);
    expect(frames).toHaveLength(0);
    parser.push('retry: nope\n\n');
    expect(retries).toEqual([3000]);
  });

  it('reassembles frames split across chunks at any boundary', () => {
    const { frames, parser } = collect();
    const text = 'id: x:9\nevent: pantry.add\ndata: {"id":"p1"}\n\n';
    for (const ch of text) parser.push(ch);
    expect(frames).toEqual([{ id: 'x:9', event: 'pantry.add', data: '{"id":"p1"}' }]);
  });

  it('handles CRLF and lone CR line endings, even split across chunks', () => {
    const { frames, parser } = collect();
    parser.push('event: a\r\ndata: 1\r\n\r\n');
    parser.push('event: b\rdata: 2\r\r');
    parser.push('event: c\r');
    parser.push('\ndata: 3\r');
    parser.push('\n\r\n');
    expect(frames.map((f) => [f.event, f.data])).toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
  });

  it('dispatches an event with empty data (reset)', () => {
    const { frames, parser } = collect();
    parser.push('event: reset\ndata:\n\n');
    parser.push('event: reset\n\n');
    expect(frames).toEqual([
      { id: undefined, event: 'reset', data: '' },
      { id: undefined, event: 'reset', data: '' },
    ]);
  });

  it('strips a BOM, ignores unknown fields and ids containing NUL', () => {
    const { frames, parser } = collect();
    parser.push('﻿foo: bar\nid: bad\0id\ndata: ok\n\n');
    expect(frames).toEqual([{ id: undefined, event: 'message', data: 'ok' }]);
  });

  it('keeps a trailing partial frame buffered until completed', () => {
    const { frames, parser } = collect();
    parser.push('data: part');
    expect(frames).toHaveLength(0);
    parser.push('ial\n\n');
    expect(frames[0].data).toBe('partial');
  });
});
