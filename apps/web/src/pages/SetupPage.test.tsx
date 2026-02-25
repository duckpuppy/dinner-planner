import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SetupPage } from './SetupPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSetupComplete = vi.fn();
vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { setupComplete: () => void }) => unknown) =>
    selector({ setupComplete: mockSetupComplete }),
}));

vi.mock('@/lib/api', () => ({
  postSetup: vi.fn(),
}));

import { postSetup } from '@/lib/api';
const mockPostSetup = vi.mocked(postSetup);

function renderSetupPage() {
  return render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SetupPage', () => {
  describe('form rendering', () => {
    it('renders the setup form with all fields', () => {
      renderSetupPage();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Admin Account' })).toBeInTheDocument();
    });

    it('renders the page heading', () => {
      renderSetupPage();
      expect(screen.getByRole('heading', { name: 'Dinner Planner' })).toBeInTheDocument();
    });
  });

  describe('client-side validation', () => {
    it('shows error when username is too short', async () => {
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'ab');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(await screen.findByText('Username must be at least 3 characters')).toBeInTheDocument();
      expect(mockPostSetup).not.toHaveBeenCalled();
    });

    it('shows error when password is too short', async () => {
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'short');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'short');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
      expect(mockPostSetup).not.toHaveBeenCalled();
    });

    it('shows error when passwords do not match', async () => {
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'differentpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
      expect(mockPostSetup).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('calls postSetup with username and password on valid submit', async () => {
      mockPostSetup.mockResolvedValue(undefined);
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      await waitFor(() => expect(mockPostSetup).toHaveBeenCalledWith('adminuser', 'validpassword'));
    });

    it('calls setupComplete and navigates to /login on success', async () => {
      mockPostSetup.mockResolvedValue(undefined);
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      await waitFor(() => {
        expect(mockSetupComplete).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
    });

    it('disables submit button while submitting', async () => {
      let resolve: () => void;
      mockPostSetup.mockReturnValue(
        new Promise<void>((r) => {
          resolve = r;
        })
      );
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled()
      );
      resolve!();
    });
  });

  describe('error handling — setup already complete (404)', () => {
    it('shows already-complete message when API returns already_complete', async () => {
      mockPostSetup.mockRejectedValue(new Error('already_complete'));
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(
        await screen.findByText('Setup already completed. Please log in.')
      ).toBeInTheDocument();
    });

    it('shows a link to login when already complete', async () => {
      mockPostSetup.mockRejectedValue(new Error('already_complete'));
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      const link = await screen.findByRole('link', { name: 'Go to Login' });
      expect(link).toBeInTheDocument();
    });
  });

  describe('error handling — validation errors from API (400)', () => {
    it('shows field-level errors from API response', async () => {
      const err = Object.assign(new Error('setup_failed'), {
        details: { details: { username: ['Username already taken'] } },
      });
      mockPostSetup.mockRejectedValue(err);
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(await screen.findByText('Username already taken')).toBeInTheDocument();
    });

    it('shows general error when setup_failed has no field details', async () => {
      const err = Object.assign(new Error('setup_failed'), {
        details: { error: 'Internal server error' },
      });
      mockPostSetup.mockRejectedValue(err);
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(await screen.findByText('Internal server error')).toBeInTheDocument();
    });
  });

  describe('error handling — network error', () => {
    it('shows generic error on unexpected error', async () => {
      mockPostSetup.mockRejectedValue(new Error('network failure'));
      renderSetupPage();
      await userEvent.type(screen.getByLabelText('Username'), 'adminuser');
      await userEvent.type(screen.getByLabelText('Password'), 'validpassword');
      await userEvent.type(screen.getByLabelText('Confirm Password'), 'validpassword');
      fireEvent.submit(
        screen.getByRole('button', { name: 'Create Admin Account' }).closest('form')!
      );
      expect(
        await screen.findByText('An unexpected error occurred. Please try again.')
      ).toBeInTheDocument();
    });
  });
});
