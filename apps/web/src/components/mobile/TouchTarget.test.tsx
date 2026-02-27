import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TouchTarget } from './TouchTarget';

afterEach(() => {
  cleanup();
});

describe('TouchTarget', () => {
  it('renders children', () => {
    const { getByText } = render(<TouchTarget>Tap me</TouchTarget>);
    expect(getByText('Tap me')).toBeTruthy();
  });

  it('applies touch-manipulation class', () => {
    const { container } = render(<TouchTarget>tap</TouchTarget>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('touch-manipulation');
  });

  it('applies custom className', () => {
    const { container } = render(<TouchTarget className="extra-class">tap</TouchTarget>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('extra-class');
  });

  it('applies minWidth and minHeight inline styles', () => {
    const { container } = render(<TouchTarget>tap</TouchTarget>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.minWidth).toBeTruthy();
    expect(el.style.minHeight).toBeTruthy();
  });
});
