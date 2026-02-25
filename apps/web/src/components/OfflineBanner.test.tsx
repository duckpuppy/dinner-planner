import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

const { mockUseOnlineStatus } = vi.hoisted(() => ({
  mockUseOnlineStatus: vi.fn(),
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders offline banner when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });
});
