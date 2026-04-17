import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Plus, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restaurants } from '@/lib/api';
import type { RestaurantSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface RestaurantPickerProps {
  value: string;
  onChange: (id: string, restaurant: RestaurantSummary) => void;
  placeholder?: string;
}

interface RestaurantPickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedId: string;
  onSelect: (id: string, restaurant: RestaurantSummary) => void;
}

function RestaurantPickerModal({
  open,
  onClose,
  selectedId,
  onSelect,
}: RestaurantPickerModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCuisine, setNewCuisine] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['restaurants', { archived: 'false', limit: '100' }],
    queryFn: () => restaurants.list({ archived: 'false', limit: '100' }),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; cuisineType?: string | null; location?: string | null }) =>
      restaurants.create({
        name: input.name,
        cuisineType: input.cuisineType ?? null,
        location: input.location ?? null,
        notes: null,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      const summary: RestaurantSummary = {
        id: created.id,
        name: created.name,
        cuisineType: created.cuisineType,
        location: created.location,
        visitCount: created.visitCount,
        averageRating: created.averageRating,
        lastVisitedAt: created.lastVisitedAt,
      };
      onSelect(created.id, summary);
      onClose();
    },
  });

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  // Reset state and autofocus when opening
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setShowCreateForm(false);
      setNewName('');
      setNewCuisine('');
      setNewLocation('');
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Autofocus name field when create form shown
  useEffect(() => {
    if (showCreateForm) {
      const t = setTimeout(() => nameRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [showCreateForm]);

  if (!open) return null;

  const allRestaurants = (data?.restaurants ?? []) as unknown as RestaurantSummary[];
  const filtered = allRestaurants.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    createMutation.mutate({
      name: trimmedName,
      cuisineType: newCuisine.trim() || null,
      location: newLocation.trim() || null,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card border rounded-t-2xl sm:rounded-xl shadow-lg w-full sm:max-w-md mx-0 sm:mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <h2 className="text-base font-semibold flex-1">Select Restaurant</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search bar */}
        {!showCreateForm && (
          <div className="px-4 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search restaurants..."
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
                aria-label="Search restaurants"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {showCreateForm ? (
            /* Create new restaurant inline form */
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-medium">New Restaurant</h3>
              <div>
                <label className="block text-xs text-muted-foreground mb-1" htmlFor="rp-name">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  ref={nameRef}
                  id="rp-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  placeholder="Restaurant name"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1" htmlFor="rp-cuisine">
                  Cuisine type (optional)
                </label>
                <input
                  id="rp-cuisine"
                  type="text"
                  value={newCuisine}
                  onChange={(e) => setNewCuisine(e.target.value)}
                  placeholder="e.g. Italian, Mexican..."
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1" htmlFor="rp-location">
                  Location (optional)
                </label>
                <input
                  id="rp-location"
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. 123 Main St or Downtown"
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
              </div>
              {createMutation.isError && (
                <p className="text-xs text-destructive">Failed to create restaurant. Try again.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="py-2 px-4 border rounded-md text-sm hover:bg-muted"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            /* Restaurant list */
            <div role="listbox" aria-label="Restaurants">
              {/* Create new option */}
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted transition-colors min-h-[48px] text-primary border-b"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-medium">Add new restaurant...</span>
              </button>

              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading restaurants...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                  <Search className="h-8 w-8 mb-2 opacity-40" aria-hidden="true" />
                  <p>{searchQuery ? 'No restaurants found' : 'No restaurants yet'}</p>
                </div>
              ) : (
                filtered.map((restaurant) => {
                  const isSelected = restaurant.id === selectedId;
                  return (
                    <button
                      key={restaurant.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(restaurant.id, restaurant);
                        onClose();
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted transition-colors min-h-[48px]',
                        isSelected && 'bg-primary/5'
                      )}
                    >
                      <span className="shrink-0" aria-hidden="true">
                        {isSelected ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <span className="inline-block h-4 w-4" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium">{restaurant.name}</span>
                        {restaurant.cuisineType && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {restaurant.cuisineType}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function RestaurantPicker({
  value,
  onChange,
  placeholder = 'Select a restaurant...',
}: RestaurantPickerProps) {
  const [open, setOpen] = useState(false);

  // Fetch selected restaurant name for display
  const { data } = useQuery({
    queryKey: ['restaurants', { archived: 'false', limit: '100' }],
    queryFn: () => restaurants.list({ archived: 'false', limit: '100' }),
    enabled: !!value,
  });

  const allRestaurants = (data?.restaurants ?? []) as unknown as RestaurantSummary[];
  const selectedRestaurant = allRestaurants.find((r) => r.id === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background text-sm hover:bg-muted/50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select restaurant"
      >
        <span className={cn(!selectedRestaurant && 'text-muted-foreground')}>
          {selectedRestaurant ? selectedRestaurant.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" aria-hidden="true" />
      </button>
      <RestaurantPickerModal
        open={open}
        onClose={() => setOpen(false)}
        selectedId={value}
        onSelect={onChange}
      />
    </>
  );
}
