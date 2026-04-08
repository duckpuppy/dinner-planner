import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeImportModal } from './RecipeImportModal';

// Mock API module
vi.mock('@/lib/api', () => ({
  dishes: {
    importFromUrl: vi.fn(),
    importVideoUrl: vi.fn(),
    getVideoJob: vi.fn(),
  },
}));

// Mock toast so we can assert on errors
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { dishes as dishesApi } from '@/lib/api';
import { toast } from 'sonner';
import type { VideoJob } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('RecipeImportModal', () => {
  const onImported = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onImported.mockClear();
    onClose.mockClear();
  });

  it('renders the modal title', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    expect(screen.getByText('Import Recipe from URL')).toBeDefined();
  });

  it('renders the URL input', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    expect(screen.getByLabelText('Recipe URL')).toBeDefined();
  });

  it('renders the Fetch Recipe button', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    expect(screen.getByText('Fetch Recipe')).toBeDefined();
  });

  it('Fetch Recipe button is disabled when URL is empty', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    const button = screen.getByText('Fetch Recipe').closest('button');
    expect(button?.disabled).toBe(true);
  });

  it('Fetch Recipe button is enabled when URL is entered', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    fireEvent.change(screen.getByLabelText('Recipe URL'), {
      target: { value: 'https://example.com/recipe' },
    });
    const button = screen.getByText('Fetch Recipe').closest('button');
    expect(button?.disabled).toBe(false);
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close (X) button is clicked', () => {
    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onImported with recipe data on successful import', async () => {
    const mockRecipe = {
      name: 'Pasta',
      description: 'Delicious',
      type: 'main' as const,
      ingredients: [],
      instructions: 'Cook it',
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      sourceUrl: 'https://example.com/recipe',
      videoUrl: null,
      tags: [],
    };
    vi.mocked(dishesApi.importFromUrl).mockResolvedValueOnce({ recipe: mockRecipe });

    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });

    const input = screen.getByLabelText('Recipe URL');
    fireEvent.change(input, { target: { value: 'https://example.com/recipe' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith(mockRecipe);
    });
  });

  it('calls importFromUrl with the entered URL', async () => {
    vi.mocked(dishesApi.importFromUrl).mockResolvedValueOnce({
      recipe: {
        name: 'Test',
        description: '',
        type: 'main',
        ingredients: [],
        instructions: '',
        prepTime: null,
        cookTime: null,
        servings: null,
        sourceUrl: null,
        videoUrl: null,
        tags: [],
      },
    });

    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });

    const input = screen.getByLabelText('Recipe URL');
    fireEvent.change(input, { target: { value: 'https://allrecipes.com/recipe/123' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(vi.mocked(dishesApi.importFromUrl)).toHaveBeenCalledWith(
        'https://allrecipes.com/recipe/123'
      );
    });
  });

  it('shows toast.error when import fails', async () => {
    vi.mocked(dishesApi.importFromUrl).mockRejectedValueOnce(new Error('No recipe data found'));

    render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });

    const input = screen.getByLabelText('Recipe URL');
    fireEvent.change(input, { target: { value: 'https://example.com/no-recipe' } });

    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });

    await waitFor(
      () => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('No recipe data found');
      },
      { timeout: 3000 }
    );
    expect(onImported).not.toHaveBeenCalled();
  });

  describe('isVideoUrl detection', () => {
    const videoUrls = [
      'https://youtube.com/watch?v=abc',
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
      'https://tiktok.com/@user/video/123',
      'https://www.instagram.com/reel/abc',
      'https://vimeo.com/123456',
      'https://twitter.com/i/status/123',
      'https://x.com/i/status/123',
      'https://www.facebook.com/video/123',
    ];

    const nonVideoUrls = [
      'https://allrecipes.com/recipe/pasta',
      'https://seriouseats.com/recipe',
      'https://bbcgoodfood.com/recipes/pizza',
      'https://example.com/recipe',
    ];

    videoUrls.forEach((url) => {
      it(`shows video mode title for ${new URL(url).hostname}`, () => {
        render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
        fireEvent.change(screen.getByLabelText('Recipe URL'), { target: { value: url } });
        expect(screen.getByText('Import Recipe from Video')).toBeDefined();
      });
    });

    nonVideoUrls.forEach((url) => {
      it(`shows URL mode title for ${new URL(url).hostname}`, () => {
        render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
        fireEvent.change(screen.getByLabelText('Recipe URL'), { target: { value: url } });
        expect(screen.getByText('Import Recipe from URL')).toBeDefined();
      });
    });

    it('shows "Import Video" submit button for video URLs', () => {
      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      fireEvent.change(screen.getByLabelText('Recipe URL'), {
        target: { value: 'https://youtube.com/watch?v=abc' },
      });
      expect(screen.getByText('Import Video')).toBeDefined();
    });

    it('shows "Video URL" label for video URLs', () => {
      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      fireEvent.change(screen.getByLabelText('Recipe URL'), {
        target: { value: 'https://youtube.com/watch?v=abc' },
      });
      expect(screen.getByLabelText('Video URL')).toBeDefined();
    });
  });

  describe('video import flow', () => {
    it('calls importVideoUrl for video URLs instead of importFromUrl', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-1' });
      vi.mocked(dishesApi.getVideoJob).mockResolvedValue({
        job: {
          id: 'job-1',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'pending',
          progress: 0,
          resultVideoFilename: null,
          resultMetadata: null,
          extractedRecipe: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        } satisfies VideoJob,
      });

      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const input = screen.getByLabelText('Recipe URL');
      fireEvent.change(input, { target: { value: 'https://youtube.com/watch?v=abc' } });
      fireEvent.submit(input.closest('form')!);

      await waitFor(() => {
        expect(vi.mocked(dishesApi.importVideoUrl)).toHaveBeenCalledWith(
          'https://youtube.com/watch?v=abc'
        );
        expect(vi.mocked(dishesApi.importFromUrl)).not.toHaveBeenCalled();
      });
    });

    it('shows "Starting import..." while video mutation is pending', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockReturnValue(new Promise(() => {}));

      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const input = screen.getByLabelText('Recipe URL');
      fireEvent.change(input, { target: { value: 'https://youtube.com/watch?v=abc' } });

      await act(async () => {
        fireEvent.submit(input.closest('form')!);
      });

      expect(screen.getByText('Starting import...')).toBeDefined();
    });

    /**
     * Helper: submit a video URL and wait for the first poll to fire.
     * Uses fake timers (setInterval only) to control polling without
     * affecting Promise resolution.
     */
    async function submitVideoAndPoll(
      jobResponse: { job: VideoJob },
      url = 'https://youtube.com/watch?v=abc'
    ) {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      vi.mocked(dishesApi.getVideoJob).mockResolvedValue(jobResponse);

      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const input = screen.getByLabelText('Recipe URL');
      fireEvent.change(input, { target: { value: url } });
      fireEvent.submit(input.closest('form')!);

      // Wait for the importVideoUrl mutation to resolve (sets videoJobId)
      await waitFor(() => {
        expect(vi.mocked(dishesApi.importVideoUrl)).toHaveBeenCalled();
      });
      // Allow promises to flush (mutation onSuccess → setVideoJobId → effect re-runs → setInterval)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Now advance the fake timer to trigger the first poll interval
      await act(async () => {
        vi.advanceTimersByTime(2001);
      });

      // Allow the async poll callback to complete
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      vi.useRealTimers();
    }

    it('calls onImported when job completes with extractedRecipe', async () => {
      const mockRecipe = {
        name: 'Video Pasta',
        description: 'From video',
        type: 'main' as const,
        ingredients: [],
        sourceUrl: 'https://youtube.com/watch?v=abc',
      };

      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-2' });

      await submitVideoAndPoll({
        job: {
          id: 'job-2',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'complete',
          progress: 100,
          resultVideoFilename: null,
          resultMetadata: null,
          extractedRecipe: mockRecipe,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      });

      await waitFor(() => {
        expect(onImported).toHaveBeenCalledWith(mockRecipe);
      });
    });

    it('calls onImported with shell recipe when job completes without extractedRecipe', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-3' });

      await submitVideoAndPoll({
        job: {
          id: 'job-3',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'complete',
          progress: 100,
          resultVideoFilename: null,
          resultMetadata: { title: 'My Video Recipe', description: 'A great dish' },
          extractedRecipe: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      });

      await waitFor(() => {
        expect(onImported).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My Video Recipe',
            description: 'A great dish',
            type: 'main',
            sourceUrl: 'https://youtube.com/watch?v=abc',
            ingredients: [],
          })
        );
      });
    });

    it('shows error message when job fails', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-4' });

      await submitVideoAndPoll({
        job: {
          id: 'job-4',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'failed',
          progress: 0,
          resultVideoFilename: null,
          resultMetadata: null,
          extractedRecipe: null,
          error: 'Download timed out',
          createdAt: '',
          updatedAt: '',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Download timed out')).toBeDefined();
      });
    });

    it('shows error when importVideoUrl itself fails', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockRejectedValueOnce(
        new Error('Video service unavailable')
      );

      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const input = screen.getByLabelText('Recipe URL');
      fireEvent.change(input, { target: { value: 'https://youtube.com/watch?v=abc' } });

      await act(async () => {
        fireEvent.submit(input.closest('form')!);
      });

      await waitFor(() => {
        expect(screen.getByText('Video service unavailable')).toBeDefined();
      });
    });

    it('shows downloading progress bar when job is downloading', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-5' });

      await submitVideoAndPoll({
        job: {
          id: 'job-5',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'downloading',
          progress: 45,
          resultVideoFilename: null,
          resultMetadata: null,
          extractedRecipe: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Downloading video... 45%')).toBeDefined();
      });
    });

    it('shows extracting status for extracting job', async () => {
      vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: 'job-6' });

      await submitVideoAndPoll({
        job: {
          id: 'job-6',
          dishId: null,
          sourceUrl: 'https://youtube.com/watch?v=abc',
          status: 'extracting',
          progress: 100,
          resultVideoFilename: null,
          resultMetadata: null,
          extractedRecipe: null,
          error: null,
          createdAt: '',
          updatedAt: '',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Extracting recipe...')).toBeDefined();
      });
    });
  });

  describe('keyboard and backdrop interactions', () => {
    it('calls onClose on Escape key', () => {
      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const backdrop = document.querySelector('[role="presentation"]') as HTMLElement;
      fireEvent.keyDown(backdrop, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop is clicked', () => {
      render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
      const backdrop = document.querySelector('[role="presentation"]') as HTMLElement;
      // Simulate clicking the backdrop itself (target === currentTarget)
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
