import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './Layout';

const { mockLogout } = vi.hoisted(() => ({
  mockLogout: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      role: 'user',
      familyName: 'Aikens Family',
    },
    logout: mockLogout,
  })),
}));

import { useAuthStore } from '@/stores/auth';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation(() => ({
    user: {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      role: 'user',
      familyName: 'Aikens Family',
    },
    logout: mockLogout,
  }));
});

function renderLayout(content?: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/today']}>
        <Layout>{content ?? <div>Page content</div>}</Layout>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Layout version label', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes plain semver release versions with v and uses the muted style', () => {
    vi.stubGlobal('__APP_VERSION__', '1.19.0');
    renderLayout();
    const el = screen.getByTestId('app-version');
    expect(el.textContent).toBe('v1.19.0');
    expect(el.className).not.toContain('amber');
  });

  it.each(['testing-abc1234', '1.18.1-dev', 'android-abc1234'])(
    'renders non-release version %s raw with the amber style',
    (version) => {
      vi.stubGlobal('__APP_VERSION__', version);
      renderLayout();
      const el = screen.getByTestId('app-version');
      expect(el.textContent).toBe(version);
      expect(el.className).toContain('amber');
    }
  );
});

describe('Layout', () => {
  describe('rendering', () => {
    it('renders the Dinner Planner title in sidebar', () => {
      renderLayout();
      expect(screen.getByText('Dinner Planner')).toBeTruthy();
    });

    it('renders children content', () => {
      renderLayout(<div>My Page</div>);
      expect(screen.getByText('My Page')).toBeTruthy();
    });

    it('renders nav items in mobile bar', () => {
      renderLayout();
      // Today appears in both mobile and desktop nav
      const todayLinks = screen.getAllByText('Today');
      expect(todayLinks.length).toBeGreaterThan(0);
    });

    it('renders user display name initial in sidebar', () => {
      renderLayout();
      // First letter of "Alice" = "A"
      expect(screen.getByText('A')).toBeTruthy();
    });

    it('renders user display name in sidebar', () => {
      renderLayout();
      expect(screen.getByText('Alice')).toBeTruthy();
    });

    it('renders family name in sidebar', () => {
      renderLayout();
      expect(screen.getByText('Aikens Family')).toBeTruthy();
    });

    it('renders Sign out button in sidebar', () => {
      renderLayout();
      expect(screen.getByText('Sign out')).toBeTruthy();
    });
  });

  describe('admin navigation', () => {
    it('shows admin section when user is admin', () => {
      vi.mocked(useAuthStore).mockImplementation(() => ({
        user: {
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          role: 'admin',
        },
        logout: mockLogout,
      }));
      renderLayout();
      expect(screen.getByText('Admin')).toBeTruthy();
    });

    it('does not show admin section when user is not admin', () => {
      renderLayout();
      expect(screen.queryByText('Admin')).toBeNull();
    });
  });

  describe('logout', () => {
    it('calls logout when Sign out clicked', () => {
      renderLayout();
      fireEvent.click(screen.getByText('Sign out'));
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('null user', () => {
    it('renders without crashing when user is null', () => {
      vi.mocked(useAuthStore).mockImplementation(() => ({
        user: null,
        logout: mockLogout,
      }));
      renderLayout();
      // Sidebar still shows
      expect(screen.getByText('Dinner Planner')).toBeTruthy();
    });
  });
});
