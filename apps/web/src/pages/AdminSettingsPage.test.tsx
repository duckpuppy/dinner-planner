import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminSettingsPage } from './AdminSettingsPage';

vi.mock('@/lib/api', () => ({
  settings: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { settings } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminSettingsPage', () => {
  describe('rendering', () => {
    it('renders the page heading', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      render(<AdminSettingsPage />, { wrapper });
      expect(screen.getByRole('heading', { name: 'Application Settings' })).toBeTruthy();
    });

    it('shows loading skeleton initially', () => {
      vi.mocked(settings.get).mockReturnValue(new Promise(() => {}));
      render(<AdminSettingsPage />, { wrapper });
      // During loading, the form is not shown (animate-pulse skeleton is displayed)
      expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
      // The heading is still visible
      expect(screen.getByRole('heading', { name: 'Application Settings' })).toBeTruthy();
    });

    it('renders week start day select after loading', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        const select = document.querySelector('select') as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.value).toBe('0');
      });
    });

    it('renders recency window days input after loading', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 1, recencyWindowDays: 14 },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        const input = document.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe('14');
      });
    });
  });

  describe('form submission', () => {
    it('calls settings.update on form submit', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      vi.mocked(settings.update).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        expect(document.querySelector('select')).toBeTruthy();
      });
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
      await waitFor(() => {
        expect(settings.update).toHaveBeenCalledWith({ weekStartDay: 0, recencyWindowDays: 30 });
      });
    });

    it('disables save button while submitting', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      let resolveUpdate: () => void;
      vi.mocked(settings.update).mockReturnValue(
        new Promise((r) => {
          resolveUpdate = () => r({ settings: { weekStartDay: 0, recencyWindowDays: 30 } });
        })
      );
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
      resolveUpdate!();
    });

    it('changes week start day when select changes', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
      const select = document.querySelector('select') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      expect(select.value).toBe('1');
    });

    it('changes recency window days when input changes', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { weekStartDay: 0, recencyWindowDays: 30 },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => expect(document.querySelector('input[type="number"]')).toBeTruthy());
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '60' } });
      expect(input.value).toBe('60');
    });
  });
});
