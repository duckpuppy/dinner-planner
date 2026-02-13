import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges conditional classes', () => {
    expect(cn('px-2', false && 'hidden', 'text-sm')).toBe('px-2 text-sm');
  });

  it('dedupes tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
