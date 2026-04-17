import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  restaurants as restaurantsApi,
  type RestaurantDetail,
  type RestaurantDish,
} from '@/lib/api';
import {
  Plus,
  Search,
  UtensilsCrossed,
  MapPin,
  Star,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Edit2,
  X,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StarDisplay({ rating, count }: { rating: number | null; count?: number }) {
  if (rating === null) {
    return <span className="text-sm text-muted-foreground">No ratings</span>;
  }
  return (
    <span className="flex items-center gap-1 text-sm tabular-nums">
      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
      <span>{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface RestaurantFormData {
  name: string;
  cuisineType: string;
  location: string;
  notes: string;
}

interface RestaurantFormModalProps {
  initial?: Partial<RestaurantFormData>;
  onSave: (data: RestaurantFormData) => void;
  onClose: () => void;
  isPending: boolean;
  title: string;
}

function RestaurantFormModal({
  initial,
  onSave,
  onClose,
  isPending,
  title,
}: RestaurantFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cuisineType, setCuisineType] = useState(initial?.cuisineType ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), cuisineType, location, notes });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restaurant-form-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-background rounded-t-xl sm:rounded-xl shadow-lg w-full sm:max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="restaurant-form-title" className="text-lg font-semibold text-balance">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="restaurant-name" className="block text-sm font-medium mb-1">
              Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="restaurant-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Restaurant name"
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label htmlFor="restaurant-cuisine" className="block text-sm font-medium mb-1">
              Cuisine type
            </label>
            <input
              id="restaurant-cuisine"
              type="text"
              value={cuisineType}
              onChange={(e) => setCuisineType(e.target.value)}
              placeholder="e.g. Italian, Thai, Mexican"
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label htmlFor="restaurant-location" className="block text-sm font-medium mb-1">
              Location
            </label>
            <input
              id="restaurant-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or neighborhood"
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label htmlFor="restaurant-notes" className="block text-sm font-medium mb-1">
              Notes
            </label>
            <textarea
              id="restaurant-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this restaurant"
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restaurant card
// ---------------------------------------------------------------------------

interface RestaurantCardProps {
  restaurant: RestaurantDetail;
  onClick: () => void;
}

function RestaurantCard({ restaurant, onClick }: RestaurantCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border rounded-lg p-4 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{restaurant.name}</p>
          {restaurant.cuisineType && (
            <p className="text-sm text-muted-foreground truncate">{restaurant.cuisineType}</p>
          )}
          {restaurant.location && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {restaurant.location}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <StarDisplay rating={restaurant.averageRating} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {restaurant.visitCount} {restaurant.visitCount === 1 ? 'visit' : 'visits'}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export function RestaurantsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const showArchived = searchParams.get('archived') === 'true';
  const searchQuery = searchParams.get('q') ?? '';

  function setShowArchived(val: boolean) {
    setSearchParams(
      (prev) => {
        if (val) {
          prev.set('archived', 'true');
        } else {
          prev.delete('archived');
        }
        return prev;
      },
      { replace: true }
    );
  }

  function setSearchQuery(val: string) {
    setSearchParams(
      (prev) => {
        if (val) {
          prev.set('q', val);
        } else {
          prev.delete('q');
        }
        return prev;
      },
      { replace: true }
    );
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['restaurants', { archived: String(showArchived) }],
    queryFn: () => restaurantsApi.list({ archived: String(showArchived), limit: '100' }),
  });

  const filteredRestaurants = useMemo(() => {
    const all = data?.restaurants ?? [];
    if (!searchQuery) return all;
    const q = searchQuery.toLowerCase();
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisineType?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q)
    );
  }, [data?.restaurants, searchQuery]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; cuisineType: string; location: string; notes: string }) =>
      restaurantsApi.create({
        name: data.name,
        cuisineType: data.cuisineType || null,
        location: data.location || null,
        notes: data.notes || null,
      }),
    onSuccess: (created) => {
      toast.success('Restaurant added');
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setShowCreateModal(false);
      navigate(`/restaurants/${created.id}`);
    },
    onError: () => {
      toast.error('Failed to add restaurant');
    },
  });

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-balance">Restaurants</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          aria-label="Add restaurant"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search restaurants…"
          aria-label="Search restaurants"
          className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        />
      </div>

      {/* Archive toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
            showArchived
              ? 'bg-secondary text-secondary-foreground'
              : 'hover:bg-muted text-muted-foreground'
          )}
          aria-pressed={showArchived}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          Archived
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonList count={5} />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load restaurants'}
        />
      ) : filteredRestaurants.length === 0 ? (
        <div className="text-center py-12">
          <UtensilsCrossed
            className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-muted-foreground font-medium">
            {searchQuery
              ? 'No restaurants match your search'
              : showArchived
                ? 'No archived restaurants'
                : 'No restaurants yet'}
          </p>
          {!searchQuery && !showArchived && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
            >
              Add your first restaurant
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRestaurants.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              onClick={() => navigate(`/restaurants/${restaurant.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <RestaurantFormModal
          title="Add restaurant"
          onSave={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreateModal(false)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function RestaurantDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);

  const {
    data: restaurant,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['restaurants', id],
    queryFn: () => restaurantsApi.get(id),
  });

  const { data: dishesData, isLoading: dishesLoading } = useQuery({
    queryKey: ['restaurants', id, 'dishes'],
    queryFn: () => restaurantsApi.listDishes(id),
    enabled: !!restaurant,
  });

  const dishes: RestaurantDish[] = dishesData?.dishes ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; cuisineType: string; location: string; notes: string }) =>
      restaurantsApi.update(id, {
        name: data.name,
        cuisineType: data.cuisineType || null,
        location: data.location || null,
        notes: data.notes || null,
      }),
    onSuccess: () => {
      toast.success('Restaurant updated');
      queryClient.invalidateQueries({ queryKey: ['restaurants', id] });
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setShowEditModal(false);
    },
    onError: () => {
      toast.error('Failed to update restaurant');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => restaurantsApi.update(id, { archived: !restaurant?.archived }),
    onSuccess: () => {
      toast.success(restaurant?.archived ? 'Restaurant restored' : 'Restaurant archived');
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      navigate('/restaurants');
    },
    onError: () => {
      toast.error('Failed to update restaurant');
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <SkeletonList count={4} />
      </div>
    );
  }

  if (isError || !restaurant) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <ErrorState message={error instanceof Error ? error.message : 'Restaurant not found'} />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Back nav */}
      <button
        onClick={() => navigate('/restaurants')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        aria-label="Back to restaurants"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Restaurants
      </button>

      {/* Restaurant header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-balance">{restaurant.name}</h1>
          {restaurant.cuisineType && (
            <p className="text-muted-foreground mt-0.5">{restaurant.cuisineType}</p>
          )}
          {restaurant.location && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {restaurant.location}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setShowEditModal(true)}
            className="p-2 border rounded-md hover:bg-muted transition-colors"
            aria-label="Edit restaurant"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="p-2 border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            aria-label={restaurant.archived ? 'Restore restaurant' : 'Archive restaurant'}
          >
            {restaurant.archived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold tabular-nums">{restaurant.visitCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {restaurant.visitCount === 1 ? 'Visit' : 'Visits'}
          </p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold tabular-nums">
            {restaurant.averageRating !== null ? restaurant.averageRating.toFixed(1) : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Avg rating</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-sm font-semibold tabular-nums">
            {formatDate(restaurant.lastVisitedAt)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Last visit</p>
        </div>
      </div>

      {/* Notes */}
      {restaurant.notes && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Notes
          </h2>
          <p className="text-sm text-pretty whitespace-pre-wrap">{restaurant.notes}</p>
        </div>
      )}

      {/* Dishes */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Dishes
        </h2>
        {dishesLoading ? (
          <SkeletonList count={3} />
        ) : dishes.length === 0 ? (
          <div className="text-center py-8 border rounded-lg">
            <p className="text-sm text-muted-foreground">No dishes tracked yet</p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Dishes at this restaurant">
            {dishes.map((dish) => (
              <li key={dish.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{dish.name}</p>
                    {dish.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
                        {dish.notes}
                      </p>
                    )}
                  </div>
                  <StarDisplay rating={dish.averageRating} count={dish.ratingCount} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <RestaurantFormModal
          title="Edit restaurant"
          initial={{
            name: restaurant.name,
            cuisineType: restaurant.cuisineType ?? '',
            location: restaurant.location ?? '',
            notes: restaurant.notes ?? '',
          }}
          onSave={(data) => updateMutation.mutate(data)}
          onClose={() => setShowEditModal(false)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

export function RestaurantDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    navigate('/restaurants', { replace: true });
    return null;
  }

  return <RestaurantDetail id={id} />;
}
