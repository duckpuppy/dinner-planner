import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CheckedByChip, checkedByLabel, chipColorClass, initialsOf } from './CheckedByChip';

afterEach(cleanup);

describe('CheckedByChip', () => {
  it('derives initials', () => {
    expect(initialsOf('Ann Lee')).toBe('AL');
    expect(initialsOf('  ann   marie  lee ')).toBe('AL');
    expect(initialsOf('cher')).toBe('C');
    expect(initialsOf('   ')).toBe('?');
  });

  it('picks a stable colour per user id', () => {
    expect(chipColorClass('user-1')).toBe(chipColorClass('user-1'));
    const colours = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(chipColorClass));
    expect(colours.size).toBeGreaterThan(1);
  });

  it('builds the label suffix', () => {
    expect(checkedByLabel({ id: '1', displayName: 'Ann Lee' })).toBe(', checked by Ann Lee');
    expect(checkedByLabel(undefined)).toBe('');
    expect(checkedByLabel(null)).toBe('');
  });

  it('renders initials with an accessible name and title', () => {
    render(<CheckedByChip user={{ id: 'u1', displayName: 'Ann Lee' }} />);
    const chip = screen.getByRole('img', { name: 'Checked by Ann Lee' });
    expect(chip).toHaveAttribute('title', 'Ann Lee');
    expect(chip).toHaveTextContent('AL');
  });
});
