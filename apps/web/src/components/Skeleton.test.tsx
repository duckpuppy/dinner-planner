import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonTitle, SkeletonCard, SkeletonList } from './Skeleton';

afterEach(() => {
  cleanup();
});

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="w-1/2" />);
    const el = container.querySelector('.animate-pulse');
    expect(el?.className).toContain('w-1/2');
  });
});

describe('SkeletonText', () => {
  it('renders with h-4 class', () => {
    const { container } = render(<SkeletonText />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});

describe('SkeletonTitle', () => {
  it('renders with h-8 class', () => {
    const { container } = render(<SkeletonTitle />);
    const el = container.querySelector('.animate-pulse');
    expect(el?.className).toContain('h-8');
  });
});

describe('SkeletonCard', () => {
  it('renders card container with border', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector('.rounded-lg')).toBeTruthy();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('SkeletonList', () => {
  it('renders default 3 skeleton items', () => {
    const { container } = render(<SkeletonList />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('renders custom count of skeleton items', () => {
    const { container } = render(<SkeletonList count={5} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(5);
  });
});
