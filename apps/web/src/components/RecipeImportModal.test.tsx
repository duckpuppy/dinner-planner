import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeImportModal } from './RecipeImportModal';

// Mock API module
vi.mock('@/lib/api', () => ({
  dishes: {
    importFromUrl: vi.fn(),
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

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
});
