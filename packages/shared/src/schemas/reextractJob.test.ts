import { describe, it, expect } from 'vitest';
import { reextractJobSchema, REEXTRACT_EXTRA_TEXT_MAX } from './index.js';

describe('reextractJobSchema', () => {
  it('accepts an empty object', () => {
    expect(reextractJobSchema.safeParse({}).success).toBe(true);
  });

  it('trims extraText', () => {
    const r = reextractJobSchema.parse({ extraText: '  2 cups flour \n' });
    expect(r.extraText).toBe('2 cups flour');
  });

  it('accepts text at the limit and rejects text over it (length measured after trim)', () => {
    const ok = 'a'.repeat(REEXTRACT_EXTRA_TEXT_MAX);
    expect(reextractJobSchema.safeParse({ extraText: `  ${ok}  ` }).success).toBe(true);
    expect(reextractJobSchema.safeParse({ extraText: ok + 'a' }).success).toBe(false);
  });

  it('accepts http and https URLs', () => {
    expect(reextractJobSchema.safeParse({ recipeUrl: 'https://a.test/r' }).success).toBe(true);
    expect(reextractJobSchema.safeParse({ recipeUrl: ' http://a.test/r ' }).success).toBe(true);
  });

  it('rejects non-URLs and non-http(s) schemes', () => {
    for (const recipeUrl of ['not a url', 'ftp://a.test/r', 'javascript:alert(1)', 'a.test/r']) {
      expect(reextractJobSchema.safeParse({ recipeUrl }).success).toBe(false);
    }
  });

  it('allows blank strings (the route treats them as not provided)', () => {
    const r = reextractJobSchema.parse({ extraText: '   ', recipeUrl: '  ' });
    expect(r).toEqual({ extraText: '', recipeUrl: '' });
  });
});
