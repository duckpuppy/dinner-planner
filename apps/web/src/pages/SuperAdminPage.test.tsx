import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuperAdminPage } from './SuperAdminPage';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError: actual.ApiError,
    admin: {
      listFamilies: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { admin, ApiError } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockFamilies = [
  { id: 'family-1', name: 'The Smiths', memberCount: 3, createdAt: '', updatedAt: '' },
  { id: 'family-2', name: 'The Joneses', memberCount: 1, createdAt: '', updatedAt: '' },
];

const mockUsers = [
  {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    role: 'admin' as const,
    familyId: 'family-1',
    familyName: 'The Smiths',
    isSuperAdmin: false,
  },
  {
    id: 'user-2',
    username: 'bob',
    displayName: 'Bob',
    role: 'member' as const,
    familyId: 'family-2',
    familyName: 'The Joneses',
    isSuperAdmin: false,
  },
];

describe('SuperAdminPage', () => {
  describe('loading state', () => {
    it('shows skeleton while families are loading', () => {
      vi.mocked(admin.listFamilies).mockReturnValue(new Promise(() => {}));
      vi.mocked(admin.listUsers).mockReturnValue(new Promise(() => {}));
      const { container } = render(<SuperAdminPage />, { wrapper });
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error message when families fail to load', async () => {
      vi.mocked(admin.listFamilies).mockRejectedValue(new Error('Network error'));
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      render(<SuperAdminPage />, { wrapper });
      expect(await screen.findByText(/Failed to load families/)).toBeTruthy();
    });

    it('shows error message when users fail to load', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockRejectedValue(new Error('Network error'));
      render(<SuperAdminPage />, { wrapper });
      expect(await screen.findByText(/Failed to load users/)).toBeTruthy();
    });
  });

  describe('families table', () => {
    it('lists family names and member counts', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      render(<SuperAdminPage />, { wrapper });
      expect((await screen.findAllByText('The Smiths')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('The Joneses').length).toBeGreaterThan(0);
      expect(screen.getByText('3')).toBeTruthy();
    });
  });

  describe('users table', () => {
    it('lists users with role and family', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      render(<SuperAdminPage />, { wrapper });
      expect(await screen.findByText('Alice')).toBeTruthy();
      expect(screen.getByText('@alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
      // family names appear in both the families table and users table
      expect(screen.getAllByText('The Smiths').length).toBeGreaterThan(0);
    });
  });

  describe('edit user dialog', () => {
    it('opens edit dialog when edit button clicked', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      render(<SuperAdminPage />, { wrapper });
      await screen.findByText('Alice');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Alice' }));
      expect(screen.getByText('Edit Alice')).toBeTruthy();
    });

    it('closes dialog when cancel clicked', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      render(<SuperAdminPage />, { wrapper });
      await screen.findByText('Alice');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Alice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Family')).toBeNull();
    });

    it('calls admin.updateUser with familyId and role on submit', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      vi.mocked(admin.updateUser).mockResolvedValue({ user: mockUsers[0] });
      render(<SuperAdminPage />, { wrapper });
      await screen.findByText('Alice');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Alice' }));

      fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'family-2' } });
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'member' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(admin.updateUser).toHaveBeenCalledWith('user-1', {
          familyId: 'family-2',
          role: 'member',
        });
      });
    });

    it('shows inline error on 404 without a toast redirect', async () => {
      vi.mocked(admin.listFamilies).mockResolvedValue({ families: mockFamilies });
      vi.mocked(admin.listUsers).mockResolvedValue({ users: mockUsers });
      vi.mocked(admin.updateUser).mockRejectedValue(new ApiError(404, 'Family not found'));
      render(<SuperAdminPage />, { wrapper });
      await screen.findByText('Alice');
      fireEvent.click(screen.getByRole('button', { name: 'Edit Alice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(await screen.findByText('Family not found')).toBeTruthy();
      // Dialog stays open so the operator can correct and retry.
      expect(screen.getByText('Edit Alice')).toBeTruthy();
    });
  });
});
