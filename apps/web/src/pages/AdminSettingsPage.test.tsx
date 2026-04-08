import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminSettingsPage } from './AdminSettingsPage';

vi.mock('@/lib/api', () => ({
  settings: {
    get: vi.fn(),
    update: vi.fn(),
    getOllamaStatus: vi.fn(),
    testOllamaConnection: vi.fn(),
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
import { toast } from 'sonner';

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

  describe('AI & Video settings', () => {
    const defaultSettings = {
      weekStartDay: 0,
      recencyWindowDays: 30,
      ollamaUrl: null,
      ollamaModel: 'gemma4-e4b',
      llmMode: 'disabled' as const,
      n8nWebhookUrl: null,
      videoStorageLimitMb: 10240,
    };

    beforeEach(() => {
      vi.mocked(settings.get).mockResolvedValue({ settings: defaultSettings });
      vi.mocked(settings.update).mockResolvedValue({ settings: defaultSettings });
    });

    it('renders LLM mode radio buttons', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        expect(screen.getByDisplayValue('disabled')).toBeDefined();
        expect(screen.getByDisplayValue('direct')).toBeDefined();
        expect(screen.getByDisplayValue('n8n')).toBeDefined();
      });
    });

    it('disabled radio is checked by default when llmMode is disabled', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitFor(() => {
        const radio = screen.getByDisplayValue('disabled') as HTMLInputElement;
        expect(radio.checked).toBe(true);
      });
    });

    // Helper: wait for data to load (settings form fully rendered)
    async function waitForLoad() {
      await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
    }

    it('switching to direct mode shows Ollama URL field', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => {
        expect(screen.getByLabelText('Ollama URL')).toBeDefined();
        expect(screen.getByLabelText('Ollama Model')).toBeDefined();
      });
    });

    it('switching to n8n mode shows n8n webhook URL field', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByDisplayValue('n8n'));

      await waitFor(() => {
        expect(screen.getByLabelText('n8n Webhook URL')).toBeDefined();
      });
    });

    it('switching to direct then back hides n8n field', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByDisplayValue('n8n'));
      await waitFor(() => expect(screen.getByLabelText('n8n Webhook URL')).toBeDefined());

      fireEvent.click(screen.getByDisplayValue('disabled'));
      await waitFor(() => {
        expect(screen.queryByLabelText('n8n Webhook URL')).toBeNull();
        expect(screen.queryByLabelText('Ollama URL')).toBeNull();
      });
    });

    it('Ollama URL field is not visible when mode is disabled', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      expect(screen.queryByLabelText('Ollama URL')).toBeNull();
    });

    it('Test Connection button is disabled when Ollama URL is empty', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /test connection/i });
        expect(btn).toBeDisabled();
      });
    });

    it('Test Connection button calls settings.testOllamaConnection on click', async () => {
      vi.mocked(settings.testOllamaConnection).mockResolvedValueOnce({
        available: true,
      });

      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => expect(screen.getByLabelText('Ollama URL')).toBeDefined());
      fireEvent.change(screen.getByLabelText('Ollama URL'), {
        target: { value: 'http://192.168.0.250:11434' },
      });

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /test connection/i });
        expect(btn).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(settings.testOllamaConnection).toHaveBeenCalledOnce();
      });
    });

    it('shows connected message when Ollama test succeeds', async () => {
      vi.mocked(settings.testOllamaConnection).mockResolvedValueOnce({
        available: true,
      });

      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => expect(screen.getByLabelText('Ollama URL')).toBeDefined());
      fireEvent.change(screen.getByLabelText('Ollama URL'), {
        target: { value: 'http://192.168.0.250:11434' },
      });

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/connected to/i)).toBeDefined();
      });
    });

    it('shows error message when Ollama test returns unavailable', async () => {
      vi.mocked(settings.testOllamaConnection).mockResolvedValueOnce({
        available: false,
      });

      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => expect(screen.getByLabelText('Ollama URL')).toBeDefined());
      fireEvent.change(screen.getByLabelText('Ollama URL'), {
        target: { value: 'http://192.168.0.250:11434' },
      });

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText('Ollama is not reachable at the configured URL')).toBeDefined();
      });
    });

    it('shows error message when Ollama test throws', async () => {
      vi.mocked(settings.testOllamaConnection).mockRejectedValueOnce(new Error('Network error'));

      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => expect(screen.getByLabelText('Ollama URL')).toBeDefined());
      fireEvent.change(screen.getByLabelText('Ollama URL'), {
        target: { value: 'http://192.168.0.250:11434' },
      });

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText('Connection test failed')).toBeDefined();
      });
    });

    it('Save AI & Video Settings button calls settings.update with LLM fields', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();
      fireEvent.click(screen.getByDisplayValue('direct'));

      await waitFor(() => expect(screen.getByLabelText('Ollama URL')).toBeDefined());
      fireEvent.change(screen.getByLabelText('Ollama URL'), {
        target: { value: 'http://192.168.0.250:11434' },
      });
      fireEvent.change(screen.getByLabelText('Ollama Model'), {
        target: { value: 'llama3' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save ai & video settings/i }));

      await waitFor(() => {
        expect(settings.update).toHaveBeenCalledWith(
          expect.objectContaining({
            llmMode: 'direct',
            ollamaUrl: 'http://192.168.0.250:11434',
            ollamaModel: 'llama3',
          })
        );
      });
    });

    it('shows success toast after saving AI & Video settings', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByRole('button', { name: /save ai & video settings/i }));

      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('AI & Video settings saved');
      });
    });

    it('shows error toast when saving AI & Video settings fails', async () => {
      vi.mocked(settings.update).mockRejectedValueOnce(new Error('Server error'));

      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      fireEvent.click(screen.getByRole('button', { name: /save ai & video settings/i }));

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to save AI & Video settings');
      });
    });

    it('video storage limit input changes value', async () => {
      render(<AdminSettingsPage />, { wrapper });
      await waitForLoad();

      const input = screen.getByLabelText('Video Storage Limit (MB)') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '5120' } });

      await waitFor(() => {
        expect((screen.getByLabelText('Video Storage Limit (MB)') as HTMLInputElement).value).toBe(
          '5120'
        );
      });
    });

    it('loads llmMode from server settings', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: { ...defaultSettings, llmMode: 'direct', ollamaUrl: 'http://localhost:11434' },
      });

      render(<AdminSettingsPage />, { wrapper });

      await waitFor(() => {
        const radio = screen.getByDisplayValue('direct') as HTMLInputElement;
        expect(radio.checked).toBe(true);
      });
    });

    it('loads n8n mode from server settings and shows webhook field', async () => {
      vi.mocked(settings.get).mockResolvedValue({
        settings: {
          ...defaultSettings,
          llmMode: 'n8n',
          n8nWebhookUrl: 'https://n8n.example.com/webhook/abc',
        },
      });

      render(<AdminSettingsPage />, { wrapper });

      await waitFor(() => {
        const radio = screen.getByDisplayValue('n8n') as HTMLInputElement;
        expect(radio.checked).toBe(true);
        const urlInput = screen.getByLabelText('n8n Webhook URL') as HTMLInputElement;
        expect(urlInput.value).toBe('https://n8n.example.com/webhook/abc');
      });
    });
  });
});
