import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockUpdatePreferences, mockGetState } = vi.hoisted(() => ({
  mockUpdatePreferences: vi.fn(),
  mockGetState: vi.fn(() => ({ user: null })),
}));

vi.mock('@/lib/api', () => ({
  users: {
    updatePreferences: mockUpdatePreferences,
  },
}));

vi.mock('./auth', () => ({
  useAuthStore: {
    getState: mockGetState,
  },
}));

import { useThemeStore } from './theme';

afterEach(() => {
  vi.clearAllMocks();
  // Reset store to initial state
  useThemeStore.setState({ theme: 'light' });
});

describe('useThemeStore', () => {
  describe('initial state', () => {
    it('defaults to light theme', () => {
      const { theme } = useThemeStore.getState();
      expect(theme).toBe('light');
    });
  });

  describe('setTheme', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: vi.fn(),
          getItem: vi.fn(),
        },
        writable: true,
      });
      document.documentElement.classList.toggle = vi.fn();
      mockGetState.mockReturnValue({ user: null });
    });

    it('sets theme to dark', () => {
      useThemeStore.getState().setTheme('dark');
      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('sets theme to light', () => {
      useThemeStore.setState({ theme: 'dark' });
      useThemeStore.getState().setTheme('light');
      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('toggles dark class on documentElement', () => {
      useThemeStore.getState().setTheme('dark');
      expect(document.documentElement.classList.toggle).toHaveBeenCalledWith('dark', true);
    });

    it('sets localStorage', () => {
      useThemeStore.getState().setTheme('dark');
      expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('calls users.updatePreferences when user is logged in', () => {
      mockUpdatePreferences.mockResolvedValue({});
      mockGetState.mockReturnValue({ user: { id: 'user-1' } });

      useThemeStore.getState().setTheme('dark');
      expect(mockUpdatePreferences).toHaveBeenCalledWith('user-1', { theme: 'dark' });
    });

    it('does NOT call updatePreferences when no user', () => {
      mockGetState.mockReturnValue({ user: null });

      useThemeStore.getState().setTheme('dark');
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
    });
  });

  describe('initTheme', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: vi.fn(),
          getItem: vi.fn(),
        },
        writable: true,
      });
      document.documentElement.classList.toggle = vi.fn();
    });

    it('uses provided userTheme when given', () => {
      useThemeStore.getState().initTheme('dark');
      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('falls back to localStorage theme when no userTheme provided', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('dark');
      useThemeStore.getState().initTheme();
      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('defaults to light when no userTheme and no localStorage value', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      useThemeStore.getState().initTheme();
      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('applies dark theme to document', () => {
      useThemeStore.getState().initTheme('dark');
      expect(document.documentElement.classList.toggle).toHaveBeenCalledWith('dark', true);
    });

    it('applies light theme correctly (toggle false)', () => {
      useThemeStore.getState().initTheme('light');
      expect(document.documentElement.classList.toggle).toHaveBeenCalledWith('dark', false);
    });
  });
});
