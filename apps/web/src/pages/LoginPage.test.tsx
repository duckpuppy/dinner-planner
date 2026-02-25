import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';

const { mockLogin } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { login: typeof mockLogin }) => unknown) =>
    selector({ login: mockLogin }),
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  describe('rendering', () => {
    it('renders the Dinner Planner heading', () => {
      render(<LoginPage />);
      expect(screen.getByRole('heading', { name: 'Dinner Planner' })).toBeTruthy();
    });

    it('renders username input', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Username')).toBeTruthy();
    });

    it('renders password input', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('Password')).toBeTruthy();
    });

    it('renders Sign in button', () => {
      render(<LoginPage />);
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });
  });

  describe('form submission', () => {
    it('calls login with username and password on submit', async () => {
      mockLogin.mockResolvedValue(undefined);
      render(<LoginPage />);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'password123');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('alice', 'password123');
      });
    });

    it('shows "Signing in..." while submitting', async () => {
      let resolveLogin: () => void;
      mockLogin.mockReturnValue(
        new Promise<void>((r) => {
          resolveLogin = r;
        })
      );
      render(<LoginPage />);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'pass');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
      );
      resolveLogin!();
    });

    it('shows ApiError message on authentication failure', async () => {
      const { ApiError } = await import('@/lib/api');
      mockLogin.mockRejectedValue(new ApiError('Invalid credentials'));
      render(<LoginPage />);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'wrong');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      expect(await screen.findByText('Invalid credentials')).toBeTruthy();
    });

    it('shows generic error on unexpected error', async () => {
      mockLogin.mockRejectedValue(new Error('Network error'));
      render(<LoginPage />);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'pass');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      expect(await screen.findByText('An unexpected error occurred')).toBeTruthy();
    });

    it('clears error on new submission attempt', async () => {
      const { ApiError } = await import('@/lib/api');
      mockLogin.mockRejectedValueOnce(new ApiError('Bad creds'));
      mockLogin.mockResolvedValueOnce(undefined);
      render(<LoginPage />);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'wrong');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      await screen.findByText('Bad creds');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
      await waitFor(() => expect(screen.queryByText('Bad creds')).toBeNull());
    });
  });
});
