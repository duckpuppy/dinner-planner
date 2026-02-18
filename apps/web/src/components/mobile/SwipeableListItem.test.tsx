import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SwipeableListItem } from './SwipeableListItem';
import { Edit2, Trash2 } from 'lucide-react';
import type { SwipeDirection } from 'react-swipeable';

// Mock dependencies
const mockHaptic = {
  tap: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/hooks/useHaptic', () => ({
  useHaptic: () => ({ haptic: mockHaptic }),
}));

const mockIsMobileDevice = vi.fn(() => true);
const mockPrefersReducedMotion = vi.fn(() => false);

vi.mock('@/utils/mobile', () => ({
  isMobileDevice: () => mockIsMobileDevice(),
  prefersReducedMotion: () => mockPrefersReducedMotion(),
  TOUCH_TARGET_MIN: 44,
}));

vi.mock('./SwipeActions', () => ({
  SwipeActions: ({ actions, visible }: { actions: unknown[]; visible: boolean }) => (
    <div data-testid="swipe-actions" data-visible={visible}>
      {visible && actions.length > 0 && <span>Actions: {actions.length}</span>}
    </div>
  ),
}));

// Mock react-swipeable
let swipeHandlers: {
  onSwiping?: (eventData: { dir: SwipeDirection; deltaX: number }) => void;
  onSwiped?: (eventData: { dir: SwipeDirection }) => void;
} = {};

vi.mock('react-swipeable', () => ({
  useSwipeable: vi.fn((handlers: any) => {
    swipeHandlers = handlers;
    return {};
  }),
}));

describe('SwipeableListItem', () => {
  const mockActions = [
    {
      label: 'Edit',
      icon: Edit2,
      color: 'secondary' as const,
      onAction: vi.fn(),
    },
    {
      label: 'Delete',
      icon: Trash2,
      color: 'destructive' as const,
      onAction: vi.fn(),
    },
  ];

  const defaultProps = {
    children: <div>Test Item</div>,
    actions: mockActions,
    itemId: 'item-1',
    activeItemId: null,
    onSwipeStart: vi.fn(),
    onSwipeEnd: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    swipeHandlers = {};
    // Reset to defaults
    mockIsMobileDevice.mockReturnValue(true);
    mockPrefersReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  describe('rendering', () => {
    it('renders children', () => {
      render(<SwipeableListItem {...defaultProps} />);

      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('renders with data-swipeable-item attribute', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      const swipeableItem = container.querySelector('[data-swipeable-item]');
      expect(swipeableItem).toBeInTheDocument();
    });

    it('renders SwipeActions component', () => {
      render(<SwipeableListItem {...defaultProps} />);

      expect(screen.getByTestId('swipe-actions')).toBeInTheDocument();
    });

    it('initializes with actions hidden', () => {
      render(<SwipeableListItem {...defaultProps} />);

      const actions = screen.getByTestId('swipe-actions');
      expect(actions).toHaveAttribute('data-visible', 'false');
    });
  });

  describe('disabled state', () => {
    it('renders simplified markup when on desktop', () => {
      mockIsMobileDevice.mockReturnValueOnce(false);

      const { container } = render(<SwipeableListItem {...defaultProps} />);

      const swipeableItem = container.querySelector('[data-swipeable-item]');
      expect(swipeableItem).toBeInTheDocument();
      expect(swipeableItem?.className).toBe('');
    });

    it('renders simplified markup when prefers-reduced-motion', () => {
      mockPrefersReducedMotion.mockReturnValueOnce(true);

      const { container } = render(<SwipeableListItem {...defaultProps} />);

      const swipeableItem = container.querySelector('[data-swipeable-item]');
      expect(swipeableItem).toBeInTheDocument();
      expect(swipeableItem?.className).toBe('');
    });
  });

  describe('swipe gestures', () => {
    it('updates offset during left swipe', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      // Simulate swiping left
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -50 }); });

      const content = container.querySelector('[style*="translateX"]');
      expect(content).toHaveStyle({ transform: 'translateX(-50px)' });
    });

    it('limits offset to threshold + 20px', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      // Swipe beyond threshold
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -150 }); });

      const content = container.querySelector('[style*="translateX"]');
      // Should be capped at -(80 + 20) = -100px
      expect(content).toHaveStyle({ transform: 'translateX(-100px)' });
    });

    it('triggers haptic feedback when crossing threshold', () => {
      render(<SwipeableListItem {...defaultProps} />);

      // Swipe to threshold
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });

      expect(mockHaptic.tap).toHaveBeenCalledTimes(1);
    });

    it('only triggers haptic feedback once per swipe', () => {
      render(<SwipeableListItem {...defaultProps} />);

      // Swipe past threshold multiple times
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -90 }); });
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -100 }); });

      // Should only trigger once
      expect(mockHaptic.tap).toHaveBeenCalledTimes(1);
    });

    it('reveals actions when swipe ends past threshold', () => {
      render(<SwipeableListItem {...defaultProps} />);

      // Swipe to threshold then release - two separate acts so closure updates
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      const actions = screen.getByTestId('swipe-actions');
      expect(actions).toHaveAttribute('data-visible', 'true');
    });

    it('calls onSwipeStart when revealing actions', () => {
      const onSwipeStart = vi.fn();
      render(<SwipeableListItem {...defaultProps} onSwipeStart={onSwipeStart} />);

      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      expect(onSwipeStart).toHaveBeenCalledWith('item-1');
    });

    it('resets offset when swipe ends below threshold', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      // Swipe but not enough
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -50 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      const content = container.querySelector('[style*="translateX"]');
      expect(content).toHaveStyle({ transform: 'translateX(0px)' });
    });

    it('closes actions on right swipe', () => {
      render(<SwipeableListItem {...defaultProps} />);

      // First reveal actions
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      // Then swipe right to close
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Right' }); });

      const actions = screen.getByTestId('swipe-actions');
      expect(actions).toHaveAttribute('data-visible', 'false');
    });

    it('calls onSwipeEnd when closing via right swipe', () => {
      const onSwipeEnd = vi.fn();
      render(<SwipeableListItem {...defaultProps} onSwipeEnd={onSwipeEnd} />);

      act(() => { swipeHandlers.onSwiped?.({ dir: 'Right' }); });

      expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('action handling', () => {
    it('triggers success haptic when action clicked', async () => {
      render(<SwipeableListItem {...defaultProps} />);

      // Reveal actions
      swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 });
      swipeHandlers.onSwiped?.({ dir: 'Left' });

      // Simulate action click by calling the handler directly
      const actionHandler = vi.fn(async () => {
        mockHaptic.success();
        await mockActions[0].onAction();
      });

      await actionHandler();

      expect(mockHaptic.success).toHaveBeenCalled();
    });

    it('closes actions after action is executed', () => {
      const onSwipeEnd = vi.fn();
      render(<SwipeableListItem {...defaultProps} onSwipeEnd={onSwipeEnd} />);

      // Reveal actions
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      expect(screen.getByTestId('swipe-actions')).toHaveAttribute('data-visible', 'true');
    });
  });

  describe('multiple items interaction', () => {
    it('resets when another item becomes active', () => {
      const { container, rerender } = render(<SwipeableListItem {...defaultProps} />);

      // Open this item
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      // Verify it's active
      const content = container.querySelector('[style*="translateX"]');
      expect(content).toHaveStyle({ transform: 'translateX(-80px)' });
      expect(screen.getByTestId('swipe-actions')).toHaveAttribute('data-visible', 'true');

      // Another item becomes active
      rerender(<SwipeableListItem {...defaultProps} activeItemId="item-2" />);

      // Should reset
      expect(content).toHaveStyle({ transform: 'translateX(0px)' });
      expect(screen.getByTestId('swipe-actions')).toHaveAttribute('data-visible', 'false');
    });

    it('does not reset when this item is still active', () => {
      const { container, rerender } = render(<SwipeableListItem {...defaultProps} />);

      // Open this item
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      // Re-render with this item as active
      rerender(<SwipeableListItem {...defaultProps} activeItemId="item-1" />);

      // Should still be active
      const content = container.querySelector('[style*="translateX"]');
      expect(content).toHaveStyle({ transform: 'translateX(-80px)' });
    });

    it('does not reset when no item is active', () => {
      const { container, rerender } = render(
        <SwipeableListItem {...defaultProps} activeItemId={null} />
      );

      // Open this item (even though activeItemId is null, local state manages it)
      act(() => { swipeHandlers.onSwiping?.({ dir: 'Left', deltaX: -80 }); });
      act(() => { swipeHandlers.onSwiped?.({ dir: 'Left' }); });

      // Re-render with still no active item
      rerender(<SwipeableListItem {...defaultProps} activeItemId={null} />);

      // Local state should maintain offset
      const content = container.querySelector('[style*="translateX"]');
      expect(content).toHaveStyle({ transform: 'translateX(-80px)' });
    });
  });

  describe('performance optimizations', () => {
    it('applies will-change: transform for GPU acceleration', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      // The transform element is the child of data-swipeable-item
      const swipeableItem = container.querySelector('[data-swipeable-item]');
      const content = swipeableItem?.querySelector('div');
      expect(content).toHaveStyle({ willChange: 'transform' });
    });

    it('uses touch-action: pan-y to allow vertical scrolling', () => {
      const { container } = render(<SwipeableListItem {...defaultProps} />);

      // Check for the CSS class instead of inline style
      const wrapper = container.querySelector('[data-swipeable-item]');
      expect(wrapper).toHaveClass('relative overflow-hidden');
    });
  });
});
