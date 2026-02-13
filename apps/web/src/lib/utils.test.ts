import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges conditional classes', () => {
    const isHidden = false;
    expect(cn('px-2', isHidden && 'hidden', 'text-sm')).toBe('px-2 text-sm');
  });

  it('dedupes tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
