import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X, RefreshCw, Star, Tag } from 'lucide-react';
import { suggestions as suggestionsApi } from '@/lib/api';
import type { SuggestedDish } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SuggestionModalProps {
  open: boolean;
  availableTags: string[];
  onSelect: (dish: SuggestedDish) => void;
  onClose: () => void;
}

export function SuggestionModal({ open, availableTags, onSelect, onClose }: SuggestionModalProps) {
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [excluded, setExcluded] = useState<string[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTag('');
      setExcluded([]);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suggestions', selectedTag, excluded],
    queryFn: () =>
      suggestionsApi.list({
        tag: selectedTag || undefined,
        limit: 5,
        exclude: excluded,
      }),
    enabled: open,
    staleTime: 0,
  });

  const items = data?.suggestions ?? [];

  function handleNotThis(dish: SuggestedDish) {
    setExcluded((prev) => [...prev, dish.id]);
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold flex-1">Meal Suggestion</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tag filter */}
        {availableTags.length > 0 && (
          <div className="px-4 pt-3 pb-1 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <button
                onClick={() => setSelectedTag('')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  selectedTag === ''
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                )}
              >
                All
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                    selectedTag === tag
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {isLoading || isFetching ? (
            <div className="flex flex-col gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No suggestions available</p>
              {selectedTag && (
                <button
                  className="mt-2 text-primary text-xs underline"
                  onClick={() => setSelectedTag('')}
                >
                  Clear tag filter
                </button>
              )}
            </div>
          ) : (
            items.map((dish) => (
              <SuggestionCard
                key={dish.id}
                dish={dish}
                onSelect={() => onSelect(dish)}
                onNotThis={() => handleNotThis(dish)}
              />
            ))
          )}
        </div>

        {/* Refresh hint */}
        {items.length > 0 && (
          <div className="px-4 pb-4 shrink-0">
            <button
              onClick={() => setExcluded(items.map((d) => d.id))}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground border rounded-lg hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Show different suggestions
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface SuggestionCardProps {
  dish: SuggestedDish;
  onSelect: () => void;
  onNotThis: () => void;
}

function SuggestionCard({ dish, onSelect, onNotThis }: SuggestionCardProps) {
  return (
    <div className="rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <button className="w-full text-left p-4 pb-3" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{dish.name}</p>
          {dish.avgRating !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {dish.avgRating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-1 space-y-0.5">
          {dish.reasons.map((r) => (
            <p key={r} className="text-xs text-muted-foreground">
              {r}
            </p>
          ))}
        </div>
        {dish.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {dish.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>
      <div className="px-4 pb-3 flex items-center justify-between gap-2 border-t pt-2">
        <button
          onClick={onSelect}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Use this
        </button>
        <button
          onClick={onNotThis}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Not this
        </button>
      </div>
    </div>
  );
}
