import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X, Star, MapPin } from 'lucide-react';
import { restaurants as restaurantsApi } from '@/lib/api';
import type { SuggestedRestaurant } from '@/lib/api';

export interface RestaurantSuggestionModalProps {
  open: boolean;
  onSelect: (restaurant: { id: string; name: string }) => void;
  onClose: () => void;
  exclude?: string[];
}

export function RestaurantSuggestionModal({
  open,
  onSelect,
  onClose,
  exclude = [],
}: RestaurantSuggestionModalProps) {
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
    queryKey: ['restaurantSuggestions', exclude],
    queryFn: () =>
      restaurantsApi.suggestions({
        limit: 5,
        exclude,
      }),
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
          <h2 className="text-base font-semibold flex-1">Restaurant Suggestion</h2>
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
              <p>No suggestions available</p>
            </div>
          ) : (
            items.map((restaurant) => (
              <RestaurantSuggestionCard
                key={restaurant.id}
                restaurant={restaurant}
                onSelect={() => onSelect({ id: restaurant.id, name: restaurant.name })}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface RestaurantSuggestionCardProps {
  restaurant: SuggestedRestaurant;
  onSelect: () => void;
}

function RestaurantSuggestionCard({ restaurant, onSelect }: RestaurantSuggestionCardProps) {
  return (
    <div className="rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <button className="w-full text-left p-4 pb-3" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{restaurant.name}</p>
          {restaurant.averageRating !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 tabular-nums">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
              {restaurant.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        {(restaurant.cuisineType || restaurant.location) && (
          <div className="flex items-center gap-1 mt-0.5">
            {restaurant.location && (
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
            )}
            <p className="text-xs text-muted-foreground truncate">
              {[restaurant.cuisineType, restaurant.location].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
        <div className="mt-1 space-y-0.5">
          {restaurant.reasons.map((r) => (
            <p key={r} className="text-xs text-muted-foreground">
              {r}
            </p>
          ))}
        </div>
      </button>
      <div className="px-4 pb-3 border-t pt-2">
        <button
          onClick={onSelect}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Select
        </button>
      </div>
    </div>
  );
}
