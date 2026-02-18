import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PullToRefresh } from './PullToRefresh';

const mockIsMobileDevice = vi.fn(() => true);
const mockPrefersReducedMotion = vi.fn(() => false);

// Mock mobile utils
vi.mock('@/utils/mobile', () => ({
  isMobileDevice: () => mockIsMobileDevice(),
  prefersReducedMotion: () => mockPrefersReducedMotion(),
}));

// Mock react-simple-pull-to-refresh
vi.mock('react-simple-pull-to-refresh', () => ({
  default: ({ children, onRefresh }: { children: React.ReactNode; onRefresh: () => Promise<void> }) => (
    <div data-testid="pull-to-refresh-wrapper" data-on-refresh={onRefresh ? 'present' : 'missing'}>
      {children}
    </div>
  ),
}));

describe('PullToRefresh', () => {
  const mockOnRefresh = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset to defaults
    mockIsMobileDevice.mockReturnValue(true);
    mockPrefersReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  describe('rendering', () => {
    it('renders children', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Test Content</div>
        </PullToRefresh>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('wraps children in PullToRefreshLib on mobile', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Mobile Content</div>
        </PullToRefresh>
      );

      expect(screen.getByTestId('pull-to-refresh-wrapper')).toBeInTheDocument();
      expect(screen.getByText('Mobile Content')).toBeInTheDocument();
    });

    it('passes onRefresh prop to PullToRefreshLib', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Test</div>
        </PullToRefresh>
      );

      const wrapper = screen.getByTestId('pull-to-refresh-wrapper');
      expect(wrapper).toHaveAttribute('data-on-refresh', 'present');
    });
  });

  describe('disabled state', () => {
    it('disables on desktop (not mobile device)', () => {
      mockIsMobileDevice.mockReturnValueOnce(false);

      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Desktop Content</div>
        </PullToRefresh>
      );

      expect(screen.queryByTestId('pull-to-refresh-wrapper')).not.toBeInTheDocument();
      expect(screen.getByText('Desktop Content')).toBeInTheDocument();
    });

    it('disables when prefers-reduced-motion', () => {
      mockPrefersReducedMotion.mockReturnValueOnce(true);

      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Reduced Motion Content</div>
        </PullToRefresh>
      );

      expect(screen.queryByTestId('pull-to-refresh-wrapper')).not.toBeInTheDocument();
      expect(screen.getByText('Reduced Motion Content')).toBeInTheDocument();
    });

    it('disables when both desktop and prefers-reduced-motion', () => {
      mockIsMobileDevice.mockReturnValueOnce(false);
      mockPrefersReducedMotion.mockReturnValueOnce(true);

      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Fully Disabled Content</div>
        </PullToRefresh>
      );

      expect(screen.queryByTestId('pull-to-refresh-wrapper')).not.toBeInTheDocument();
      expect(screen.getByText('Fully Disabled Content')).toBeInTheDocument();
    });

    it('returns fragment with children when disabled', () => {
      mockIsMobileDevice.mockReturnValueOnce(false);

      const { container } = render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Plain Content</div>
        </PullToRefresh>
      );

      expect(container.firstChild?.nodeName).toBe('DIV');
      expect(container.firstChild?.textContent).toBe('Plain Content');
    });
  });

  describe('progressive enhancement', () => {
    it('provides full pull-to-refresh experience on mobile', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Enhanced Mobile</div>
        </PullToRefresh>
      );

      expect(screen.getByTestId('pull-to-refresh-wrapper')).toBeInTheDocument();
    });

    it('gracefully degrades on desktop', () => {
      mockIsMobileDevice.mockReturnValueOnce(false);

      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Degraded Desktop</div>
        </PullToRefresh>
      );

      expect(screen.queryByTestId('pull-to-refresh-wrapper')).not.toBeInTheDocument();
      expect(screen.getByText('Degraded Desktop')).toBeInTheDocument();
    });

    it('respects accessibility preferences', () => {
      mockPrefersReducedMotion.mockReturnValueOnce(true);

      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Accessible Content</div>
        </PullToRefresh>
      );

      expect(screen.queryByTestId('pull-to-refresh-wrapper')).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles multiple children', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </PullToRefresh>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('handles empty children', () => {
      const { container } = render(
        <PullToRefresh onRefresh={mockOnRefresh}>{null}</PullToRefresh>
      );

      expect(container).toBeInTheDocument();
    });

    it('handles nested components', () => {
      render(
        <PullToRefresh onRefresh={mockOnRefresh}>
          <div>
            <section>
              <article>Nested Content</article>
            </section>
          </div>
        </PullToRefresh>
      );

      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });

    it('accepts async onRefresh function', () => {
      const asyncRefresh = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      render(
        <PullToRefresh onRefresh={asyncRefresh}>
          <div>Async Content</div>
        </PullToRefresh>
      );

      expect(screen.getByText('Async Content')).toBeInTheDocument();
    });
  });
});
