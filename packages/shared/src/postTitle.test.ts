import { describe, it, expect } from 'vitest';
import { cleanPostTitle } from './index.js';

const DESC = '🔥 Cowboy Mashed Potato Casserole #recipe #dinner\nIngredients: potatoes';

describe('cleanPostTitle', () => {
  it.each([
    '978K views · 16K reactions',
    '1.2M views',
    '3,402 reactions | 120 comments',
    '5 likes',
  ])('replaces stats-only title %s with the description line', (title) => {
    expect(cleanPostTitle(title, DESC)).toBe('Cowboy Mashed Potato Casserole');
  });

  it('replaces a generic Facebook placeholder', () => {
    expect(cleanPostTitle('Facebook video #123456', DESC)).toBe('Cowboy Mashed Potato Casserole');
  });

  it('replaces an empty title', () => {
    expect(cleanPostTitle('  ', DESC)).toBe('Cowboy Mashed Potato Casserole');
  });

  it('returns normal titles unchanged (trimmed)', () => {
    expect(cleanPostTitle('  Best Tacos Ever  ', DESC)).toBe('Best Tacos Ever');
    expect(cleanPostTitle('1000 views of my pasta', DESC)).toBe('1000 views of my pasta');
  });

  it('skips blank and hashtag-only lines and trims emoji/punctuation', () => {
    expect(cleanPostTitle('1.2M views', '\n#fyp #food\n  ✨ Easy Pasta! ✨ \nmore')).toBe(
      'Easy Pasta'
    );
  });

  it('truncates at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(30);
    const out = cleanPostTitle('10K views', long);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith('word…')).toBe(true);
  });

  it('adds no ellipsis when not truncated', () => {
    expect(cleanPostTitle('10K views', 'Short one')).toBe('Short one');
  });

  it('returns empty when the description is empty or has no usable text', () => {
    expect(cleanPostTitle('10K views', '')).toBe('');
    expect(cleanPostTitle('10K views', '#a #b 🔥')).toBe('');
  });
});
