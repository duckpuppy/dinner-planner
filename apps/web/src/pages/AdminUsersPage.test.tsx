import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminUsersPage } from './AdminUsersPage';

const { mockCurrentUser, mockCheckAuth, mockNavigate } = vi.hoisted(() => ({
  mockCurrentUser: {
    id: 'user-1',
    username: 'admin',
    displayName: 'Admin User',
    role: 'admin' as const,
  },
  mockCheckAuth: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(
    (selector: (s: { user: typeof mockCurrentUser; checkAuth: typeof mockCheckAuth }) => unknown) =>
      selector({ user: mockCurrentUser, checkAuth: mockCheckAuth })
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError: actual.ApiError,
    users: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      resetPassword: vi.fn(),
    },
    families: {
      getMine: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { users, families, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const mockFamily = { id: 'family-1', name: 'The Smiths', createdAt: '', updatedAt: '' };

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
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { user: typeof mockCurrentUser; checkAuth: typeof mockCheckAuth }) => unknown) =>
      selector({ user: mockCurrentUser, checkAuth: mockCheckAuth })
  );
  vi.mocked(families.getMine).mockResolvedValue({ family: mockFamily });
});

vi.mocked(families.getMine).mockResolvedValue({ family: mockFamily });

const mockUsers = [
  { id: 'user-1', username: 'admin', displayName: 'Admin User', role: 'admin' as const },
  { id: 'user-2', username: 'bob', displayName: 'Bob Smith', role: 'member' as const },
];

describe('AdminUsersPage', () => {
  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(users.list).mockReturnValue(new Promise(() => {}));
      const { container } = render(<AdminUsersPage />, { wrapper });
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error message when loading fails', async () => {
      vi.mocked(users.list).mockRejectedValue(new Error('Network error'));
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText(/Failed to load users/)).toBeTruthy();
    });
  });

  describe('user list', () => {
    it('shows heading', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText('User Management')).toBeTruthy();
    });

    it('shows Add User button', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByRole('button', { name: /Add User/i })).toBeTruthy();
    });

    it('renders user display names', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText('Admin User')).toBeTruthy();
      expect(screen.getByText('Bob Smith')).toBeTruthy();
    });

    it('renders user roles', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      expect(screen.getByText('admin')).toBeTruthy();
      expect(screen.getByText('member')).toBeTruthy();
    });

    it('shows "You" badge on current user', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText('You')).toBeTruthy();
    });

    it('does NOT show delete button for current user', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      // Only one delete button (for bob, not admin/current user)
      const deleteBtns = screen.getAllByRole('button', { name: /Delete user/i });
      expect(deleteBtns).toHaveLength(1);
    });

    it('shows edit and reset-password buttons for each user', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const editBtns = screen.getAllByRole('button', { name: /Edit user/i });
      const resetBtns = screen.getAllByRole('button', { name: /Reset password/i });
      expect(editBtns).toHaveLength(2);
      expect(resetBtns).toHaveLength(2);
    });
  });

  describe('create user form', () => {
    it('opens create form when Add User clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('User Management');
      fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
      expect(screen.getByRole('heading', { name: 'Create User' })).toBeTruthy();
    });

    it('closes create form when Cancel clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('User Management');
      fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Create User')).toBeNull();
    });

    it('calls users.create when form submitted', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(users.create).mockResolvedValue({ user: mockUsers[1] } as never);
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('User Management');
      fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

      await userEvent.type(screen.getByPlaceholderText('john_doe'), 'newuser');
      await userEvent.type(screen.getByPlaceholderText('John Doe'), 'New User');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await userEvent.type(passwordInputs[0], 'password123');

      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await waitFor(() => {
        expect(users.create).toHaveBeenCalled();
      });
    });
  });

  describe('edit user form', () => {
    it('opens edit form when edit button clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const editBtns = screen.getAllByRole('button', { name: /Edit user/i });
      fireEvent.click(editBtns[0]);
      expect(screen.getByText('Edit User')).toBeTruthy();
    });

    it('closes edit form when Cancel clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const editBtns = screen.getAllByRole('button', { name: /Edit user/i });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Edit User')).toBeNull();
    });

    it('calls users.update when edit form submitted', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(users.update).mockResolvedValue({ user: mockUsers[0] } as never);
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const editBtns = screen.getAllByRole('button', { name: /Edit user/i });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      await waitFor(() => {
        expect(users.update).toHaveBeenCalled();
      });
    });
  });

  describe('reset password form', () => {
    it('opens reset password form when reset button clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const resetBtns = screen.getAllByRole('button', { name: /Reset password/i });
      fireEvent.click(resetBtns[0]);
      expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeTruthy();
    });

    it('closes reset form when Cancel clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const resetBtns = screen.getAllByRole('button', { name: /Reset password/i });
      fireEvent.click(resetBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Reset Password')).toBeNull();
    });

    it('calls users.resetPassword when form submitted', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(users.resetPassword).mockResolvedValue(undefined as never);
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Admin User');
      const resetBtns = screen.getAllByRole('button', { name: /Reset password/i });
      fireEvent.click(resetBtns[0]);
      const passwordInput = screen.getByPlaceholderText('••••••••');
      await userEvent.type(passwordInput, 'newpassword123');
      fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
      await waitFor(() => {
        expect(users.resetPassword).toHaveBeenCalledWith('user-1', 'newpassword123');
      });
    });
  });

  describe('delete user dialog', () => {
    it('opens delete dialog when delete button clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Bob Smith');
      fireEvent.click(screen.getByRole('button', { name: /Delete user/i }));
      expect(screen.getByText('Delete User')).toBeTruthy();
    });

    it('calls users.delete when confirmed', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(users.delete).mockResolvedValue(undefined as never);
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Bob Smith');
      fireEvent.click(screen.getByRole('button', { name: /Delete user/i }));
      // ConfirmDialog has a Delete confirm button
      const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        expect(users.delete).toHaveBeenCalledWith('user-2');
      });
    });

    it('closes delete dialog when cancel clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('Bob Smith');
      fireEvent.click(screen.getByRole('button', { name: /Delete user/i }));
      expect(screen.getByText('Delete User')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByText('Delete User')).toBeNull();
      });
    });
  });

  describe('family section', () => {
    it('shows the family name', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText('The Smiths')).toBeTruthy();
    });

    it('shows error message when family fails to load', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(families.getMine).mockRejectedValue(new Error('Network error'));
      render(<AdminUsersPage />, { wrapper });
      expect(await screen.findByText(/Failed to load family details/)).toBeTruthy();
    });

    it('opens rename form when rename button clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Rename family/i }));
      expect(screen.getByLabelText('Family name')).toBeTruthy();
    });

    it('closes rename form when cancel clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Rename family/i }));
      fireEvent.click(screen.getByRole('button', { name: /Cancel editing family name/i }));
      expect(screen.queryByLabelText('Family name')).toBeNull();
    });

    it('calls families.update with the new name on submit', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(families.update).mockResolvedValue({
        family: { ...mockFamily, name: 'The Joneses' },
      });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Rename family/i }));
      const input = screen.getByLabelText('Family name');
      fireEvent.change(input, { target: { value: 'The Joneses' } });
      fireEvent.click(screen.getByRole('button', { name: /Save family name/i }));
      await waitFor(() => {
        expect(families.update).toHaveBeenCalledWith('family-1', 'The Joneses');
      });
    });

    it('shows a validation error when the new name is empty', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Rename family/i }));
      const input = screen.getByLabelText('Family name');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: /Save family name/i }));
      expect(await screen.findByText('Family name is required')).toBeTruthy();
      expect(families.update).not.toHaveBeenCalled();
    });
  });

  describe('leave and create new family dialog', () => {
    it('opens the dialog when the leave button is clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Leave and create new family/i }));
      expect(screen.getByText('Leave & create new family')).toBeTruthy();
      expect(screen.getByText(/Shared dishes/)).toBeTruthy();
      expect(screen.getByText(/Grocery lists/)).toBeTruthy();
    });

    it('closes the dialog when cancel is clicked', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Leave and create new family/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Leave & create new family')).toBeNull();
    });

    it('disables submit until a name is typed', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Leave and create new family/i }));

      const submitBtn = screen.getByRole('button', { name: /Leave & create family/i });
      expect(submitBtn).toBeDisabled();

      const input = screen.getByLabelText('New family name');
      fireEvent.change(input, { target: { value: '   ' } });
      expect(submitBtn).toBeDisabled();

      fireEvent.change(input, { target: { value: 'The Joneses' } });
      expect(submitBtn).not.toBeDisabled();

      expect(families.create).not.toHaveBeenCalled();
    });

    it('calls families.create, refreshes auth, invalidates the cache, and navigates home on success', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(families.create).mockResolvedValue({
        family: { id: 'family-2', name: 'The Joneses', createdAt: '', updatedAt: '' },
      });
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Leave and create new family/i }));

      const input = screen.getByLabelText('New family name');
      fireEvent.change(input, { target: { value: 'The Joneses' } });
      fireEvent.click(screen.getByRole('button', { name: /Leave & create family/i }));

      await waitFor(() => {
        expect(families.create).toHaveBeenCalledWith('The Joneses');
      });
      await waitFor(() => {
        expect(mockCheckAuth).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
      expect(screen.queryByText('Leave & create new family')).toBeNull();
    });

    it('shows the exact 409 safeguard message inline instead of a toast', async () => {
      vi.mocked(users.list).mockResolvedValue({ users: mockUsers });
      vi.mocked(families.create).mockRejectedValue(
        new ApiError(
          409,
          'You are the only admin of your current family. Promote another member to admin before creating a new family.'
        )
      );
      render(<AdminUsersPage />, { wrapper });
      await screen.findByText('The Smiths');
      fireEvent.click(screen.getByRole('button', { name: /Leave and create new family/i }));

      const input = screen.getByLabelText('New family name');
      fireEvent.change(input, { target: { value: 'The Joneses' } });
      fireEvent.click(screen.getByRole('button', { name: /Leave & create family/i }));

      expect(
        await screen.findByText(
          'You are the only admin of your current family. Promote another member to admin before creating a new family.'
        )
      ).toBeTruthy();
      // Dialog stays open so the user can fix the underlying problem and retry.
      expect(screen.getByText('Leave & create new family')).toBeTruthy();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
