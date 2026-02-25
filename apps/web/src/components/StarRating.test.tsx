import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StarRating, AverageRating } from './StarRating';

afterEach(() => {
  cleanup();
});

describe('StarRating', () => {
  it('renders 5 star buttons', () => {
    render(<StarRating value={0} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('calls onChange with correct star value when clicked', () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]); // 3rd star = value 3
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('does NOT call onChange when readonly is true', () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} readonly />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does NOT call onChange when no onChange provided', () => {
    // Should not throw
    render(<StarRating value={3} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    // No error
  });

  it('renders with sm size', () => {
    render(<StarRating value={0} size="sm" />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('renders with lg size', () => {
    render(<StarRating value={0} size="lg" />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('marks first N buttons as filled based on value', () => {
    const { container } = render(<StarRating value={3} />);
    const filledStars = container.querySelectorAll('.fill-yellow-400');
    expect(filledStars).toHaveLength(3);
  });
});

describe('AverageRating', () => {
  it('shows "No ratings" when average is null', () => {
    render(<AverageRating average={null} count={0} />);
    expect(screen.getByText('No ratings')).toBeTruthy();
  });

  it('shows "No ratings" when count is 0', () => {
    render(<AverageRating average={4.5} count={0} />);
    expect(screen.getByText('No ratings')).toBeTruthy();
  });

  it('renders average and count when data is provided', () => {
    render(<AverageRating average={4.5} count={10} />);
    expect(screen.getByText('4.5 (10)')).toBeTruthy();
  });

  it('renders star rating for average', () => {
    render(<AverageRating average={3} count={5} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });
});
