import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminHealthPage } from './AdminHealthPage';

vi.mock('@/lib/api', () => ({
  appEvents: {
    health: vi.fn(),
    triggerCleanup: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { appEvents } from '@/lib/api';
import { toast } from 'sonner';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockHealth = {
  videoStorage: {
    usedBytes: 524_288_000,
    usedMb: 500,
    limitMb: 1000,
    percentUsed: 50,
  },
  videoJobs: {
    pending: 2,
    downloading: 1,
    complete: 15,
    failed: 3,
    total: 21,
  },
  cleanup: {
    lastRun: new Date(Date.now() - 3_600_000).toISOString(),
    lastResult: {
      deletedFiles: 5,
      freedBytes: 104_857_600,
      errors: 0,
    },
    schedulerEnabled: true,
    schedulerConfig: '0 2 * * *',
  },
  events: {
    errorsLast24h: 4,
    warningsLast24h: 12,
    errorsLast7d: 28,
  },
};

describe('AdminHealthPage', () => {
  describe('loading state', () => {
    it('shows loading skeletons while fetching', () => {
      vi.mocked(appEvents.health).mockReturnValue(new Promise(() => {}));
      render(<AdminHealthPage />, { wrapper });
      // Skeletons are rendered as animated pulse divs (aria-hidden)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('page title and cards', () => {
    it('renders the page title and all 4 card headings', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      // Wait for data to load (cards appear after skeleton)
      expect(await screen.findByText('Video Storage')).toBeTruthy();
      expect(screen.getByText('System Health')).toBeTruthy();
      expect(screen.getByText('Video Jobs')).toBeTruthy();
      expect(screen.getByText('Video Cleanup')).toBeTruthy();
      expect(screen.getByText('Recent Issues')).toBeTruthy();
    });
  });

  describe('Video Storage card', () => {
    it('displays storage usage with correct percentage', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Storage');

      expect(screen.getByText('500 MB / 1000 MB (50%)')).toBeTruthy();
    });

    it('renders a progress bar with correct aria attributes', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Storage');

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar.getAttribute('aria-valuenow')).toBe('50');
      expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
      expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
    });
  });

  describe('Video Jobs card', () => {
    it('displays all job counts', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Jobs');

      expect(screen.getByText('Pending')).toBeTruthy();
      expect(screen.getByText('Downloading')).toBeTruthy();
      expect(screen.getByText('Complete')).toBeTruthy();
      expect(screen.getByText('Failed')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy(); // pending
      expect(screen.getByText('1')).toBeTruthy(); // downloading
      expect(screen.getByText('15')).toBeTruthy(); // complete
      expect(screen.getByText('3')).toBeTruthy(); // failed
      expect(screen.getByText('Total: 21')).toBeTruthy();
    });
  });

  describe('Cleanup Status card', () => {
    it('displays scheduler config and last run time', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Cleanup');

      expect(screen.getByText('0 2 * * *')).toBeTruthy();
      expect(screen.getByText(/1h ago/)).toBeTruthy();
    });

    it('displays last result when files were deleted', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Cleanup');

      expect(screen.getByText(/Deleted 5 files, freed 100 MB/)).toBeTruthy();
    });

    it('displays "No orphaned files" when deletedFiles is 0', async () => {
      const noFilesHealth = {
        ...mockHealth,
        cleanup: {
          ...mockHealth.cleanup,
          lastResult: { deletedFiles: 0, freedBytes: 0, errors: 0 },
        },
      };
      vi.mocked(appEvents.health).mockResolvedValue({ health: noFilesHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Cleanup');

      expect(screen.getByText('No orphaned files')).toBeTruthy();
    });

    it('shows "Never" when lastRun is null', async () => {
      const noRunHealth = {
        ...mockHealth,
        cleanup: { ...mockHealth.cleanup, lastRun: null, lastResult: null },
      };
      vi.mocked(appEvents.health).mockResolvedValue({ health: noRunHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Video Cleanup');

      expect(screen.getByText('Never')).toBeTruthy();
    });

    it('"Run Now" button triggers cleanup and shows success toast', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      vi.mocked(appEvents.triggerCleanup).mockResolvedValue({
        message: 'done',
        result: { deletedFiles: 3, freedBytes: 31_457_280, errors: 0 },
      });

      render(<AdminHealthPage />, { wrapper });

      const btn = await screen.findByText('Run Now');
      fireEvent.click(btn);

      await waitFor(() => {
        expect(vi.mocked(appEvents.triggerCleanup)).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
          expect.stringContaining('deleted 3 files')
        );
      });
    });

    it('"Run Now" button shows error toast on failure', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      vi.mocked(appEvents.triggerCleanup).mockRejectedValue(new Error('Server error'));

      render(<AdminHealthPage />, { wrapper });

      const btn = await screen.findByText('Run Now');
      fireEvent.click(btn);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          expect.stringContaining('Cleanup failed')
        );
      });
    });
  });

  describe('Recent Issues card', () => {
    it('displays error and warning counts', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Recent Issues');

      expect(screen.getByText('Errors (24h)')).toBeTruthy();
      expect(screen.getByText('Warnings (24h)')).toBeTruthy();
      expect(screen.getByText('Errors (7d)')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy(); // errorsLast24h
      expect(screen.getByText('12')).toBeTruthy(); // warningsLast24h
      expect(screen.getByText('28')).toBeTruthy(); // errorsLast7d
    });

    it('"View Logs" button is present', async () => {
      vi.mocked(appEvents.health).mockResolvedValue({ health: mockHealth });
      render(<AdminHealthPage />, { wrapper });

      await screen.findByText('Recent Issues');

      expect(screen.getByText('View Logs')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('displays error state when API fails', async () => {
      vi.mocked(appEvents.health).mockRejectedValue(new Error('Network error'));
      render(<AdminHealthPage />, { wrapper });

      expect(await screen.findByText('Failed to load health data')).toBeTruthy();
      expect(screen.getByText('Could not fetch system health information.')).toBeTruthy();
    });
  });
});
