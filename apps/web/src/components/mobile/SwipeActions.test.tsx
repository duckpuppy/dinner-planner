import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SwipeActions } from './SwipeActions';
import { Trash2, Edit2, Star } from 'lucide-react';

const mockAction = {
  label: 'Delete',
  icon: Trash2,
  color: 'destructive' as const,
  onAction: vi.fn(),
};

describe('SwipeActions', () => {
  afterEach(() => {
    cleanup();
  });

  describe('visibility', () => {
    it('renders hidden (off-screen) when visible is false', () => {
      const { container } = render(
        <SwipeActions actions={[mockAction]} visible={false} />
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('translate-x-full');
    });

    it('renders visible (on-screen) when visible is true', () => {
      const { container } = render(
        <SwipeActions actions={[mockAction]} visible={true} />
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toContain('translate-x-full');
    });
  });

  describe('actions rendering', () => {
    it('renders a button for each action', () => {
      const actions = [
        { label: 'Delete', icon: Trash2, color: 'destructive' as const, onAction: vi.fn() },
        { label: 'Edit', icon: Edit2, color: 'secondary' as const, onAction: vi.fn() },
      ];
      render(<SwipeActions actions={actions} visible={true} />);

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('renders action label text inside button', () => {
      render(<SwipeActions actions={[mockAction]} visible={true} />);
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('applies destructive color classes for destructive actions', () => {
      render(<SwipeActions actions={[mockAction]} visible={true} />);
      const btn = screen.getByRole('button', { name: 'Delete' });
      expect(btn.className).toContain('bg-red-600');
    });

    it('applies primary color classes for primary actions', () => {
      const action = { label: 'Rate', icon: Star, color: 'primary' as const, onAction: vi.fn() };
      render(<SwipeActions actions={[action]} visible={true} />);
      const btn = screen.getByRole('button', { name: 'Rate' });
      expect(btn.className).toContain('bg-blue-600');
    });

    it('applies secondary color classes for secondary actions', () => {
      const action = { label: 'Edit', icon: Edit2, color: 'secondary' as const, onAction: vi.fn() };
      render(<SwipeActions actions={[action]} visible={true} />);
      const btn = screen.getByRole('button', { name: 'Edit' });
      expect(btn.className).toContain('bg-gray-600');
    });

    it('renders zero actions as empty container', () => {
      const { container } = render(<SwipeActions actions={[]} visible={true} />);
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });
  });

  describe('action interaction', () => {
    it('calls onAction when button is clicked', () => {
      const onAction = vi.fn();
      const action = { label: 'Delete', icon: Trash2, color: 'destructive' as const, onAction };
      render(<SwipeActions actions={[action]} visible={true} />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('stops propagation on click', () => {
      const parentClickHandler = vi.fn();
      const onAction = vi.fn();
      const action = { label: 'Delete', icon: Trash2, color: 'destructive' as const, onAction };

      render(
        <div onClick={parentClickHandler}>
          <SwipeActions actions={[action]} visible={true} />
        </div>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('renders aria-label on action button', () => {
      render(<SwipeActions actions={[mockAction]} visible={true} />);
      const btn = screen.getByRole('button', { name: 'Delete' });
      expect(btn).toHaveAttribute('aria-label', 'Delete');
    });
  });
});
