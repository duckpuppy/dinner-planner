import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X, Star } from 'lucide-react';
import { restaurants as restaurantsApi } from '@/lib/api';
import type { SuggestedRestaurantDish } from '@/lib/api';

export interface DishSuggestionModalProps {
  open: boolean;
  restaurantId: string;
  onClose: () => void;
}

export function DishSuggestionModal({ open, restaurantId, onClose }: DishSuggestionModalProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['dishSuggestions', restaurantId],
    queryFn: () => restaurantsApi.dishSuggestions(restaurantId, { limit: 5 }),
    enabled: open,
    staleTime: 0,
  });

  const items = data?.suggestions ?? [];

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold flex-1">What should I order?</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Suggestions list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {isLoading ? (
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
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" aria-hidden="true" />
              <p>No dishes tracked yet — add some dishes first!</p>
            </div>
          ) : (
            items.map((dish) => <DishSuggestionCard key={dish.id} dish={dish} />)
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface DishSuggestionCardProps {
  dish: SuggestedRestaurantDish;
}

function DishSuggestionCard({ dish }: DishSuggestionCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm">{dish.name}</p>
        {dish.averageRating !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 tabular-nums">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            {dish.averageRating.toFixed(1)}
            <span className="text-muted-foreground">({dish.ratingCount})</span>
          </span>
        )}
      </div>

      {dish.notes && <p className="text-xs text-muted-foreground mt-1 text-pretty">{dish.notes}</p>}

      {dish.userRatings.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {dish.userRatings.map((ur) => `${ur.displayName}: ${ur.stars}★`).join(', ')}
        </p>
      )}

      {dish.reasons.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {dish.reasons.map((r) => (
            <p key={r} className="text-xs text-muted-foreground">
              {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
