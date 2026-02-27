import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const { mockCheckAuth } = vi.hoisted(() => ({
  mockCheckAuth: vi.fn(),
}));

vi.mock('./stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('./stores/theme', () => ({
  useThemeStore: vi.fn(),
}));

vi.mock('./hooks/useOfflineSync', () => ({
  useOfflineSync: vi.fn(() => ({ isOnline: true })),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock all pages to keep renders simple
vi.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login Page</div>,
}));
vi.mock('./pages/SetupPage', () => ({
  SetupPage: () => <div data-testid="setup-page">Setup Page</div>,
}));
vi.mock('./pages/TodayPage', () => ({
  TodayPage: () => <div data-testid="today-page">Today Page</div>,
}));
vi.mock('./pages/WeekPage', () => ({
  WeekPage: () => <div data-testid="week-page">Week Page</div>,
}));
vi.mock('./pages/DishesPage', () => ({
  DishesPage: () => <div data-testid="dishes-page">Dishes Page</div>,
}));
vi.mock('./pages/HistoryPage', () => ({
  HistoryPage: () => <div data-testid="history-page">History Page</div>,
}));
vi.mock('./pages/ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-page">Profile Page</div>,
}));
vi.mock('./pages/AdminUsersPage', () => ({
  AdminUsersPage: () => <div data-testid="admin-users-page">Admin Users Page</div>,
}));
vi.mock('./pages/AdminSettingsPage', () => ({
  AdminSettingsPage: () => <div data-testid="admin-settings-page">Admin Settings Page</div>,
}));
vi.mock('./pages/GroceryPage', () => ({
  GroceryPage: () => <div data-testid="grocery-page">Grocery Page</div>,
}));
vi.mock('./pages/PantryPage', () => ({
  PantryPage: () => <div data-testid="pantry-page">Pantry Page</div>,
}));
vi.mock('./pages/PatternsPage', () => ({
  PatternsPage: () => <div data-testid="patterns-page">Patterns Page</div>,
}));
vi.mock('./components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));
vi.mock('./components/InstallPrompt', () => ({
  InstallPrompt: () => null,
}));

import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';

// Helper to create a mock store value that works for both selector and direct calls
function makeAuthStore(state: {
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  user: { id: string; role: string; homeView?: string } | null;
}) {
  const storeState = { ...state, checkAuth: mockCheckAuth };
  // When called as useAuthStore((s) => s.user) the selector fn is passed
  // When called as useAuthStore() (no arg), return the full state
  return (selector?: (s: typeof storeState) => unknown) => {
    if (typeof selector === 'function') return selector(storeState);
    return storeState;
  };
}

function renderApp(initialPath = '/today') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('App', () => {
  beforeEach(() => {
    vi.mocked(useThemeStore).mockImplementation(
      (selector: (s: { initTheme: () => void }) => unknown) => selector({ initTheme: vi.fn() })
    );
  });

  it('shows loading screen while auth is loading', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: false,
        isLoading: true,
        setupRequired: false,
        user: null,
      }) as never
    );
    renderApp();
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows login page when not authenticated', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: false,
        isLoading: false,
        setupRequired: false,
        user: null,
      }) as never
    );
    renderApp();
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('shows setup page when setupRequired', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: false,
        isLoading: false,
        setupRequired: true,
        user: null,
      }) as never
    );
    renderApp('/setup');
    expect(screen.getByTestId('setup-page')).toBeTruthy();
  });

  it('redirects to /setup from any route when setupRequired', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: false,
        isLoading: false,
        setupRequired: true,
        user: null,
      }) as never
    );
    renderApp('/today');
    expect(screen.getByTestId('setup-page')).toBeTruthy();
  });

  it('shows today page when authenticated', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'user', homeView: 'today' },
      }) as never
    );
    renderApp('/today');
    expect(screen.getByTestId('today-page')).toBeTruthy();
  });

  it('redirects to /today from / when homeView is today', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'user', homeView: 'today' },
      }) as never
    );
    renderApp('/');
    expect(screen.getByTestId('today-page')).toBeTruthy();
  });

  it('redirects to /week from / when homeView is week', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'user', homeView: 'week' },
      }) as never
    );
    renderApp('/');
    expect(screen.getByTestId('week-page')).toBeTruthy();
  });

  it('shows dishes page when navigating to /dishes', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'user', homeView: 'today' },
      }) as never
    );
    renderApp('/dishes');
    expect(screen.getByTestId('dishes-page')).toBeTruthy();
  });

  it('admin page redirects non-admin user', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'user', homeView: 'today' },
      }) as never
    );
    renderApp('/admin/users');
    // Non-admin redirects to /, which then redirects to /today
    expect(screen.getByTestId('today-page')).toBeTruthy();
  });

  it('shows admin users page for admin user', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'admin', homeView: 'today' },
      }) as never
    );
    renderApp('/admin/users');
    expect(screen.getByTestId('admin-users-page')).toBeTruthy();
  });

  it('shows admin settings page for admin user', () => {
    vi.mocked(useAuthStore).mockImplementation(
      makeAuthStore({
        isAuthenticated: true,
        isLoading: false,
        setupRequired: false,
        user: { id: 'u1', role: 'admin', homeView: 'today' },
      }) as never
    );
    renderApp('/admin/settings');
    expect(screen.getByTestId('admin-settings-page')).toBeTruthy();
  });
});
