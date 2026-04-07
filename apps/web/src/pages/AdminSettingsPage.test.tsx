import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminSettingsPage } from './AdminSettingsPage';

vi.mock('@/lib/api', () => ({
  settings: {
    get: vi.fn(),
    update: vi.fn(),
    getOllamaStatus: vi.fn(),
  },
  apiTokens: {
    list: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ApiTokensSection', () => ({
  ApiTokensSection: () => <div data-testid="api-tokens-section" />,
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
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      render(<AdminSettingsPage />, { wrapper });
      expect(screen.getByRole('heading', { name: 'Application Settings' })).toBeTruthy();
    });

    it('shows loading skeleton initially', () => {
      vi.mocked(settings.get).mockReturnValue(new Promise(() => {}));
      render(<AdminSettingsPage />, { wrapper });
      // During loading, the general settings form is not shown (animate-pulse skeleton is displayed)
      // The AI & Video form is always rendered, so we check specifically for the general save button
      expect(screen.queryByRole('button', { name: /^save changes$/i })).toBeNull();
      // The heading is still visible
      expect(screen.getByRole('heading', { name: 'Application Settings' })).toBeTruthy();
    });

    it('renders week start day select after loading', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
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
        settings: {
          weekStartDay: 1,
          recencyWindowDays: 14,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        // Use label-based selector to get recency window input specifically
        const inputs = document.querySelectorAll('input[type="number"]');
        // The video storage limit input renders first (always visible), recency window is second after loading
        // Find by checking which one has value 14
        const recencyInput = Array.from(inputs).find(
          (el) => (el as HTMLInputElement).value === '14'
        ) as HTMLInputElement;
        expect(recencyInput).toBeTruthy();
        expect(recencyInput.value).toBe('14');
      });
    });
  });

  describe('form submission', () => {
    it('calls settings.update on form submit', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      vi.mocked(settings.update).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        expect(document.querySelector('select')).toBeTruthy();
      });
      fireEvent.submit(screen.getByRole('button', { name: /^save changes$/i }).closest('form')!);
      await waitFor(() => {
        expect(settings.update).toHaveBeenCalledWith({ weekStartDay: 0, recencyWindowDays: 30 });
      });
    });

    it('disables save button while submitting', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      let resolveUpdate: () => void;
      vi.mocked(settings.update).mockReturnValue(
        new Promise((r) => {
          resolveUpdate = () =>
            r({
              settings: {
                weekStartDay: 0,
                recencyWindowDays: 30,
                ollamaUrl: null,
                ollamaModel: 'gemma4-e4b',
                llmMode: 'disabled',
                n8nWebhookUrl: null,
                videoStorageLimitMb: 10240,
              },
            });
        })
      );
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
      fireEvent.submit(screen.getByRole('button', { name: /^save changes$/i }).closest('form')!);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
      resolveUpdate!();
    });

    it('changes week start day when select changes', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
      const select = document.querySelector('select') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });
      expect(select.value).toBe('1');
    });

    it('changes recency window days when input changes', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          weekStartDay: 0,
          recencyWindowDays: 30,
          ollamaUrl: null,
          ollamaModel: 'gemma4-e4b',
          llmMode: 'disabled',
          n8nWebhookUrl: null,
          videoStorageLimitMb: 10240,
        },
      });
      render(<AdminSettingsPage />, { wrapper });
      // Wait for the general settings form to load (select appears)
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
      // The recency window input has max=365; video storage limit has max=102400 — use that to distinguish
      const inputs = document.querySelectorAll('input[type="number"]');
      const recencyInput = Array.from(inputs).find(
        (el) => (el as HTMLInputElement).max === '365'
      ) as HTMLInputElement;
      expect(recencyInput).toBeTruthy();
      fireEvent.change(recencyInput, { target: { value: '60' } });
      expect(recencyInput.value).toBe('60');
    });
  });
});
