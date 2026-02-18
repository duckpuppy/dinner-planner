import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Link, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { dishes as dishesApi, type CreateDishData } from '@/lib/api';

interface RecipeImportModalProps {
  onImported: (recipe: CreateDishData) => void;
  onClose: () => void;
}

export function RecipeImportModal({ onImported, onClose }: RecipeImportModalProps) {
  const [url, setUrl] = useState('');

  const importMutation = useMutation({
    mutationFn: (url: string) => dishesApi.importFromUrl(url),
    onSuccess: (data) => {
      onImported(data.recipe);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import recipe');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim()) {
      importMutation.mutate(url.trim());
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Import Recipe from URL</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Paste a recipe URL to automatically import the recipe details. Supports sites with
          structured recipe data (AllRecipes, Serious Eats, BBC Food, etc.).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="recipe-url">
              Recipe URL
            </label>
            <input
              id="recipe-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/recipe"
              required
              autoFocus
              disabled={importMutation.isPending}
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={importMutation.isPending || !url.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                'Fetch Recipe'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={importMutation.isPending}
              className="py-2 px-4 border rounded-md hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
