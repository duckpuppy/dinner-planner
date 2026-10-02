import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { login: () => void }) => unknown) => selector({ login: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error {} }));

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('LoginPage offline hint', () => {
  it('is hidden while online', () => {
    render(<LoginPage />);
    expect(screen.queryByText(/You're offline/)).toBeNull();
  });

  it('explains why sign-in is unavailable while offline', () => {
    onlineManager.setOnline(false);
    render(<LoginPage />);
    expect(screen.getByRole('status').textContent).toContain(
      "You're offline. Connect to the internet to sign in."
    );
  });

  it('appears when connectivity drops', () => {
    render(<LoginPage />);
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
