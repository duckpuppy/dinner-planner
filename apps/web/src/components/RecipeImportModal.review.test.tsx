import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeImportModal } from './RecipeImportModal';

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
  dishes: {
    importFromUrl: vi.fn(),
    importVideoUrl: vi.fn(),
    getVideoJob: vi.fn(),
    reextractVideoJob: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { dishes as dishesApi, ApiError, type VideoJob, type CreateDishData } from '@/lib/api';

const URL_ = 'https://www.instagram.com/reel/abc';

function makeJob(over: Partial<VideoJob> = {}): VideoJob {
  return {
    id: 'job-1',
    dishId: null,
    sourceUrl: URL_,
    status: 'complete',
    progress: 100,
    resultVideoFilename: null,
    resultMetadata: null,
    extractedRecipe: null,
    error: null,
    rawTitle: null,
    rawDescription: null,
    extractionStatus: null,
    extractionError: null,
    warning: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const recipe: CreateDishData = {
  name: 'Extracted Tacos',
  description: 'AI description',
  type: 'main',
  sourceUrl: URL_,
  ingredients: [{ quantity: 1, unit: 'lb', name: 'beef', notes: null }],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const onImported = vi.fn();
const onClose = vi.fn();

/** Submit a video URL; the first poll returns `first`. */
async function startImport(first: VideoJob) {
  vi.mocked(dishesApi.importVideoUrl).mockResolvedValueOnce({ jobId: first.id });
  vi.mocked(dishesApi.getVideoJob).mockResolvedValueOnce({ job: first });
  render(<RecipeImportModal onImported={onImported} onClose={onClose} />, { wrapper });
  const input = screen.getByLabelText('Recipe URL');
  fireEvent.change(input, { target: { value: URL_ } });
  await act(async () => {
    fireEvent.submit(input.closest('form')!);
  });
  await tick(50);
  await tick(2001);
}

beforeEach(() => {
  vi.useFakeTimers();
  onImported.mockClear();
  onClose.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('RecipeImportModal review step', () => {
  it('shows the friendly error for a failed download', async () => {
    await startImport(
      makeJob({
        status: 'failed',
        error: "This link doesn't point to a video - check it's a full share link",
      })
    );
    expect(screen.getByRole('alert').textContent).toContain("This link doesn't point to a video");
    expect(screen.getByRole('button', { name: 'Try another link' })).toBeDefined();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('imports directly when extraction succeeded and there is no warning', async () => {
    await startImport(makeJob({ extractionStatus: 'llm', extractedRecipe: recipe }));
    expect(onImported).toHaveBeenCalledWith(recipe);
  });

  it('failed: prefills cleaned title + full description, shows notice and retry', async () => {
    await startImport(
      makeJob({
        extractionStatus: 'failed',
        extractionError: 'Model timed out',
        rawTitle: '🧀🌮🍕 Pepperoni Pizza Tacos 🍕🌮🧀 Ingredients: cheese',
        rawDescription: 'Full post text #yum',
      })
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(
      screen.getByText(/AI recipe extraction failed — prefilled from the post\./)
    ).toBeDefined();
    expect(screen.getByText(/Model timed out/)).toBeDefined();
    expect((screen.getByLabelText('Dish name') as HTMLInputElement).value).toBe(
      'Pepperoni Pizza Tacos'
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
      'Full post text #yum'
    );
    expect(screen.getByRole('button', { name: 'Try extraction again' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to dish form' }));
    expect(onImported).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pepperoni Pizza Tacos', description: 'Full post text #yum' })
    );
  });

  it('disabled: shows the settings notice and no retry button', async () => {
    await startImport(makeJob({ extractionStatus: 'disabled', rawTitle: 'Soup' }));
    expect(
      screen.getByText('AI extraction is turned off (Admin → Settings) — prefilled from the post.')
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Try extraction again' })).toBeNull();
  });

  it('no_description: shows notice and retry button', async () => {
    await startImport(makeJob({ extractionStatus: 'no_description', rawTitle: 'Soup' }));
    expect(screen.getByText('The post had no description to extract from.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try extraction again' })).toBeDefined();
  });

  it('warning-only import shows the notice, keeps the recipe, and renders no player', async () => {
    await startImport(
      makeJob({
        extractionStatus: 'llm',
        extractedRecipe: recipe,
        warning: 'Video could not be downloaded',
      })
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Video couldn't be downloaded — recipe extracted from the post description. Check it before saving."
      )
    ).toBeDefined();
    expect((screen.getByLabelText('Dish name') as HTMLInputElement).value).toBe('Extracted Tacos');
    expect(document.querySelector('video, img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try extraction again' })).toBeNull();
  });

  describe('re-extract', () => {
    const failed = () =>
      makeJob({
        extractionStatus: 'failed',
        extractionError: 'boom',
        rawTitle: 'Pizza Tacos',
        rawDescription: 'raw desc',
      });

    it('202 then polling then success merges without clobbering user edits', async () => {
      await startImport(failed());
      fireEvent.change(screen.getByLabelText('Dish name'), { target: { value: 'My Own Name' } });

      vi.mocked(dishesApi.reextractVideoJob).mockResolvedValueOnce({
        job: makeJob({ status: 'extracting' }),
      });
      vi.mocked(dishesApi.getVideoJob)
        .mockResolvedValueOnce({ job: makeJob({ status: 'extracting' }) })
        .mockResolvedValueOnce({
          job: makeJob({ extractionStatus: 'llm', extractedRecipe: recipe }),
        });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try extraction again' }));
      });
      await tick(0);
      expect(screen.getByText('Extracting recipe...')).toBeDefined();

      await tick(2001);
      expect(screen.getByText('Extracting recipe...')).toBeDefined();
      await tick(2001);

      expect(screen.getByText(/Recipe extracted/)).toBeDefined();
      expect((screen.getByLabelText('Dish name') as HTMLInputElement).value).toBe('My Own Name');
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
        'AI description'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continue to dish form' }));
      expect(onImported).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Own Name',
          ingredients: recipe.ingredients,
        })
      );
    });

    it('polling then failed updates the notice', async () => {
      await startImport(failed());
      vi.mocked(dishesApi.reextractVideoJob).mockResolvedValueOnce({
        job: makeJob({ status: 'extracting' }),
      });
      vi.mocked(dishesApi.getVideoJob).mockResolvedValueOnce({
        job: makeJob({ extractionStatus: 'failed', extractionError: 'still broken' }),
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try extraction again' }));
      });
      await tick(2001);
      expect(screen.getByText(/still broken/)).toBeDefined();
      expect(screen.getByText('Extraction failed again.')).toBeDefined();
    });

    it('409 resumes polling', async () => {
      await startImport(failed());
      vi.mocked(dishesApi.reextractVideoJob).mockRejectedValueOnce(
        new ApiError(409, 'Extraction already in progress')
      );
      vi.mocked(dishesApi.getVideoJob).mockResolvedValueOnce({
        job: makeJob({ extractionStatus: 'llm', extractedRecipe: recipe }),
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try extraction again' }));
      });
      await tick(0);
      expect(screen.getByText('Extracting recipe...')).toBeDefined();
      await tick(2001);
      expect(screen.getByText(/Recipe extracted/)).toBeDefined();
    });

    it('429 shows a friendly message', async () => {
      await startImport(failed());
      vi.mocked(dishesApi.reextractVideoJob).mockRejectedValueOnce(new ApiError(429, 'slow down'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try extraction again' }));
      });
      expect(screen.getByText('Too many attempts. Please try again in a minute.')).toBeDefined();
    });

    it('gives up after about four minutes', async () => {
      await startImport(failed());
      vi.mocked(dishesApi.reextractVideoJob).mockResolvedValueOnce({
        job: makeJob({ status: 'extracting' }),
      });
      vi.mocked(dishesApi.getVideoJob).mockResolvedValue({
        job: makeJob({ status: 'extracting' }),
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try extraction again' }));
      });
      await tick(241_000);
      expect(screen.getByText(/taking longer than expected/)).toBeDefined();
    });
  });
});
