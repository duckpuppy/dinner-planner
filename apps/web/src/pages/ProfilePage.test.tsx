import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';

const { mockUpdateUser, mockLogout, mockUser } = vi.hoisted(() => {
  const mockUser = {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice Smith',
    role: 'admin' as const,
    theme: 'light' as const,
    homeView: 'today' as const,
    dietaryPreferences: [] as string[],
  };
  return {
    mockUpdateUser: vi.fn(),
    mockLogout: vi.fn(),
    mockUser,
  };
});

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: mockUser,
    logout: mockLogout,
    updateUser: mockUpdateUser,
  })),
}));

vi.mock('@/stores/theme', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'light', setTheme: vi.fn() })),
}));

vi.mock('@/lib/api', () => ({
  users: {
    updatePreferences: vi.fn().mockResolvedValue({ user: mockUser }),
    changePassword: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
  DIETARY_TAGS: ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'low_carb'],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { users } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(useAuthStore).mockImplementation(() => ({
    user: mockUser,
    logout: mockLogout,
    updateUser: mockUpdateUser,
  }));
  vi.mocked(useThemeStore).mockImplementation(() => ({ theme: 'light', setTheme: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfilePage', () => {
  describe('rendering', () => {
    it('renders page heading', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    });

    it('renders user display name', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByText('Alice Smith')).toBeTruthy();
    });

    it('renders username with @ prefix', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByText('@alice')).toBeTruthy();
    });

    it('renders user role', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByText('admin')).toBeTruthy();
    });

    it('returns null when no user', () => {
      vi.mocked(useAuthStore).mockImplementation(() => ({
        user: null,
        logout: mockLogout,
        updateUser: mockUpdateUser,
      }));
      const { container } = render(<ProfilePage />, { wrapper });
      expect(container.firstChild).toBeNull();
    });
  });

  describe('theme toggle', () => {
    it('renders Light button when theme is light', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByRole('button', { name: /light/i })).toBeTruthy();
    });

    it('renders Dark button when theme is dark', () => {
      vi.mocked(useThemeStore).mockImplementation(() => ({ theme: 'dark', setTheme: vi.fn() }));
      render(<ProfilePage />, { wrapper });
      expect(screen.getByRole('button', { name: /dark/i })).toBeTruthy();
    });

    it('calls setTheme and updatePreferences when theme button clicked', async () => {
      const mockSetTheme = vi.fn();
      vi.mocked(useThemeStore).mockImplementation(() => ({ theme: 'light', setTheme: mockSetTheme }));
      vi.mocked(users.updatePreferences).mockResolvedValue({ user: mockUser });
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /light/i }));
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
      await waitFor(() => {
        expect(users.updatePreferences).toHaveBeenCalledWith('u1', { theme: 'dark' });
      });
    });
  });

  describe('home view toggle', () => {
    it('renders Today and Week buttons', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByRole('button', { name: /^today$/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^week$/i })).toBeTruthy();
    });

    it('calls updateUser and updatePreferences when Week clicked', async () => {
      vi.mocked(users.updatePreferences).mockResolvedValue({ user: { ...mockUser, homeView: 'week' } });
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      expect(mockUpdateUser).toHaveBeenCalledWith({ homeView: 'week' });
      await waitFor(() => {
        expect(users.updatePreferences).toHaveBeenCalledWith('u1', { homeView: 'week' });
      });
    });
  });

  describe('dietary preferences', () => {
    it('renders all dietary preference checkboxes', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByLabelText('Vegetarian')).toBeTruthy();
      expect(screen.getByLabelText('Vegan')).toBeTruthy();
      expect(screen.getByLabelText('Gluten-Free')).toBeTruthy();
    });

    it('checkboxes are unchecked by default when no preferences set', () => {
      render(<ProfilePage />, { wrapper });
      const checkbox = screen.getByLabelText('Vegetarian') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('calls updatePreferences when dietary tag toggled', async () => {
      vi.mocked(users.updatePreferences).mockResolvedValue({
        user: { ...mockUser, dietaryPreferences: ['vegetarian'] },
      });
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByLabelText('Vegetarian'));
      await waitFor(() => {
        expect(users.updatePreferences).toHaveBeenCalledWith('u1', {
          dietaryPreferences: ['vegetarian'],
        });
      });
    });

    it('removes a tag when already-checked tag is toggled off', async () => {
      vi.mocked(useAuthStore).mockImplementation(() => ({
        user: { ...mockUser, dietaryPreferences: ['vegetarian'] },
        logout: mockLogout,
        updateUser: mockUpdateUser,
      }));
      vi.mocked(users.updatePreferences).mockResolvedValue({
        user: { ...mockUser, dietaryPreferences: [] },
      });
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByLabelText('Vegetarian'));
      await waitFor(() => {
        expect(users.updatePreferences).toHaveBeenCalledWith('u1', {
          dietaryPreferences: [],
        });
      });
    });
  });

  describe('change password', () => {
    // Helper: get password inputs by position (Current, New, Confirm)
    function getPasswordInputs() {
      return document.querySelectorAll('input[type="password"]');
    }

    it('shows Change Password button initially', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByText('Change Password')).toBeTruthy();
    });

    it('shows password form when Change Password clicked', () => {
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      // Form heading appears
      expect(screen.getByRole('heading', { name: 'Change Password' })).toBeTruthy();
      // Three password inputs are shown
      expect(getPasswordInputs()).toHaveLength(3);
    });

    it('shows validation error when passwords do not match', async () => {
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'oldpass123');
      await userEvent.type(newPw, 'newpass123');
      await userEvent.type(confirm, 'different');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      expect(await screen.findByText('Passwords do not match')).toBeTruthy();
    });

    it('shows validation error when password is too short', async () => {
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'old');
      await userEvent.type(newPw, 'short');
      await userEvent.type(confirm, 'short');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
    });

    it('calls changePassword on valid submit', async () => {
      vi.mocked(users.changePassword).mockResolvedValue(undefined as never);
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'oldpass123');
      await userEvent.type(newPw, 'newpass123');
      await userEvent.type(confirm, 'newpass123');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      await waitFor(() => {
        expect(users.changePassword).toHaveBeenCalledWith('u1', 'oldpass123', 'newpass123');
      });
    });

    it('shows success state after password changed', async () => {
      vi.mocked(users.changePassword).mockResolvedValue(undefined as never);
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'oldpass123');
      await userEvent.type(newPw, 'newpass123');
      await userEvent.type(confirm, 'newpass123');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      expect(await screen.findByText('Password changed successfully!')).toBeTruthy();
    });

    it('shows error from ApiError on failure', async () => {
      const { ApiError } = await import('@/lib/api');
      vi.mocked(users.changePassword).mockRejectedValue(new ApiError('Current password is wrong'));
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'wrongpass');
      await userEvent.type(newPw, 'newpass123');
      await userEvent.type(confirm, 'newpass123');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      expect(await screen.findByText('Current password is wrong')).toBeTruthy();
    });

    it('shows generic error when non-ApiError thrown', async () => {
      vi.mocked(users.changePassword).mockRejectedValue(new Error('network'));
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      const [current, newPw, confirm] = Array.from(getPasswordInputs());
      await userEvent.type(current, 'oldpass123');
      await userEvent.type(newPw, 'newpass123');
      await userEvent.type(confirm, 'newpass123');
      fireEvent.submit(screen.getByRole('heading', { name: 'Change Password' }).closest('form')!);
      expect(await screen.findByText('Failed to change password')).toBeTruthy();
    });

    it('closes form when Cancel clicked', () => {
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Change Password'));
      expect(screen.getByRole('heading', { name: 'Change Password' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('heading', { name: 'Change Password' })).toBeNull();
    });
  });

  describe('sign out', () => {
    it('renders Sign Out button', () => {
      render(<ProfilePage />, { wrapper });
      expect(screen.getByText('Sign Out')).toBeTruthy();
    });

    it('calls logout when Sign Out clicked', () => {
      render(<ProfilePage />, { wrapper });
      fireEvent.click(screen.getByText('Sign Out'));
      expect(mockLogout).toHaveBeenCalled();
    });
  });
});
