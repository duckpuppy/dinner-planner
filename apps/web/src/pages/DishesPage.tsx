import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dishes as dishesApi,
  ratings as ratingsApi,
  stores as storesApi,
  type Dish,
  type CreateDishData,
  type Store,
  DIETARY_TAGS,
} from '@/lib/api';
import { DishNotes } from '@/components/DishNotes';
import {
  Plus,
  ChefHat,
  Archive,
  ArchiveRestore,
  ChevronRight,
  X,
  Search,
  ArrowUpDown,
  Tag,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link,
  Minus,
  AlertTriangle,
  Video,
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AverageRating } from '@/components/StarRating';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuthStore } from '@/stores/auth';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { VideoPlayer } from '@/components/VideoPlayer';
import { RecipeImportModal } from '@/components/RecipeImportModal';

type SortOption = 'name' | 'rating' | 'recent' | 'created';

const DIETARY_TAG_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten-Free',
  dairy_free: 'Dairy-Free',
  nut_free: 'Nut-Free',
  low_carb: 'Low-Carb',
  low_calorie: 'Low-Calorie',
};

export function DishesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDietaryTag, setSelectedDietaryTag] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dishes', { archived: String(showArchived) }],
    queryFn: () => dishesApi.list({ archived: String(showArchived), limit: '100' }),
  });

  const dishes = useMemo(() => data?.dishes || [], [data?.dishes]);

  // Swipe actions state
  const { activeItemId, openSwipe, closeSwipe } = useSwipeActions();

  // Archive/unarchive mutations for swipe actions
  const archiveMutation = useMutation({
    mutationFn: (dishId: string) => dishesApi.archive(dishId),
    onSuccess: () => {
      toast.success('Dish archived');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      closeSwipe();
    },
    onError: (error) => {
      toast.error('Failed to archive dish');
      console.error('Error archiving dish:', error);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (dishId: string) => dishesApi.unarchive(dishId),
    onSuccess: () => {
      toast.success('Dish restored');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      closeSwipe();
    },
    onError: (error) => {
      toast.error('Failed to restore dish');
      console.error('Error restoring dish:', error);
    },
  });

  // Get all unique tags for filtering
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    dishes.forEach((d) => d.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [dishes]);

  // Filter and sort dishes
  const filteredDishes = useMemo(() => {
    let result = [...dishes];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (d) => d.name.toLowerCase().includes(query) || d.description?.toLowerCase().includes(query)
      );
    }

    // Apply tag filter
    if (selectedTag) {
      result = result.filter((d) => d.tags.includes(selectedTag));
    }

    // Apply dietary tag filter
    if (selectedDietaryTag) {
      result = result.filter((d) => d.dietaryTags.includes(selectedDietaryTag));
    }

    // Apply sorting
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'recent':
        result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      // Rating sort handled below with rating data
    }

    return result;
  }, [dishes, searchQuery, selectedTag, selectedDietaryTag, sortBy]);

  const mainDishes = filteredDishes.filter((d) => d.type === 'main');
  const sideDishes = filteredDishes.filter((d) => d.type === 'side');

  return (
    <PullToRefresh
      onRefresh={async () => {
        try {
          await refetch();
        } catch (error) {
          // Silently handle errors - 401s will clear auth token automatically
          console.error('Refresh failed:', error);
        }
      }}
    >
      <div className="p-4 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dishes</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted touch-manipulation"
              aria-label="Import recipe from URL"
            >
              <Link className="h-4 w-4" />
              Import URL
            </button>
            <button
              onClick={() => navigate('/dishes/new')}
              className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              aria-label="Add dish"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {showImportModal && (
          <RecipeImportModal
            onImported={(recipe) => {
              setShowImportModal(false);
              navigate('/dishes/new', { state: { prefill: recipe } });
            }}
            onClose={() => setShowImportModal(false)}
          />
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Toggle archived */}
          <div className="flex items-center gap-1 border rounded-md p-1">
            <button
              onClick={() => setShowArchived(false)}
              className={cn(
                'px-2 py-1 text-sm rounded',
                !showArchived ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted'
              )}
            >
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={cn(
                'px-2 py-1 text-sm rounded',
                showArchived ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted'
              )}
            >
              Archived
            </button>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-sm border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="name">Name</option>
              <option value="rating">Rating</option>
              <option value="recent">Recently Updated</option>
              <option value="created">Recently Created</option>
            </select>
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedTag || ''}
                onChange={(e) => setSelectedTag(e.target.value || null)}
                className="text-sm border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dietary tag filter */}
          <div className="flex items-center gap-1">
            <select
              value={selectedDietaryTag || ''}
              onChange={(e) => setSelectedDietaryTag(e.target.value || null)}
              aria-label="Filter by dietary tag"
              className="text-sm border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Dietary</option>
              {DIETARY_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {DIETARY_TAG_LABELS[tag]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <SkeletonList count={5} />
        ) : isError ? (
          <ErrorState
            message="Failed to load dishes. Please try again."
            error={error as Error}
            onRetry={() => refetch()}
          />
        ) : dishes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{showArchived ? 'No archived dishes' : 'No dishes yet'}</p>
            {!showArchived && (
              <button
                onClick={() => navigate('/dishes/new')}
                className="mt-4 text-primary hover:underline"
              >
                Add your first dish
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main dishes */}
            {mainDishes.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">
                  Main Dishes ({mainDishes.length})
                </h2>
                <div className="space-y-1 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
                  {mainDishes.map((dish) => (
                    <SwipeableListItem
                      key={dish.id}
                      itemId={dish.id}
                      activeItemId={activeItemId}
                      onSwipeStart={openSwipe}
                      onSwipeEnd={closeSwipe}
                      actions={[
                        {
                          label: dish.archived ? 'Restore' : 'Archive',
                          icon: dish.archived ? ArchiveRestore : Archive,
                          color: 'primary',
                          onAction: () => {
                            if (dish.archived) {
                              unarchiveMutation.mutate(dish.id);
                            } else {
                              archiveMutation.mutate(dish.id);
                            }
                          },
                        },
                      ]}
                    >
                      <DishRow dish={dish} onClick={() => navigate('/dishes/' + dish.id)} />
                    </SwipeableListItem>
                  ))}
                </div>
              </div>
            )}

            {/* Side dishes */}
            {sideDishes.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">
                  Side Dishes ({sideDishes.length})
                </h2>
                <div className="space-y-1 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
                  {sideDishes.map((dish) => (
                    <SwipeableListItem
                      key={dish.id}
                      itemId={dish.id}
                      activeItemId={activeItemId}
                      onSwipeStart={openSwipe}
                      onSwipeEnd={closeSwipe}
                      actions={[
                        {
                          label: dish.archived ? 'Restore' : 'Archive',
                          icon: dish.archived ? ArchiveRestore : Archive,
                          color: 'primary',
                          onAction: () => {
                            if (dish.archived) {
                              unarchiveMutation.mutate(dish.id);
                            } else {
                              archiveMutation.mutate(dish.id);
                            }
                          },
                        },
                      ]}
                    >
                      <DishRow dish={dish} onClick={() => navigate('/dishes/' + dish.id)} />
                    </SwipeableListItem>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

function DishRow({ dish, onClick }: { dish: Dish; onClick: () => void }) {
  // Fetch rating stats for this dish
  const { data: ratingData } = useQuery({
    queryKey: ['dishRating', dish.id],
    queryFn: () => ratingsApi.getDishStats(dish.id),
    staleTime: 60000, // Cache for 1 minute
  });

  const stats = ratingData?.stats;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{dish.name}</div>
        <div className="flex items-center gap-2">
          {dish.description && (
            <div className="text-sm text-muted-foreground truncate flex-1">{dish.description}</div>
          )}
          {stats && stats.totalRatings > 0 && (
            <div className="flex-shrink-0">
              <AverageRating average={stats.averageRating} count={stats.totalRatings} size="sm" />
            </div>
          )}
        </div>
        {/* Tags */}
        {dish.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {dish.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {dish.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{dish.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

function scaleQuantity(quantity: number, scale: number): string {
  const scaled = quantity * scale;
  return parseFloat(scaled.toFixed(3)).toString();
}

/**
 * Route wrapper: renders DishDetail from URL params (/dishes/:dishId).
 * Fetches the dish by ID and handles loading/error states.
 */
export function DishDetailRoute() {
  const { dishId } = useParams<{ dishId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => dishesApi.get(dishId!),
    enabled: !!dishId,
  });

  if (isLoading) return <SkeletonList count={3} />;
  if (isError || !data?.dish)
    return (
      <ErrorState message="Failed to load dish." error={error as Error} onRetry={() => refetch()} />
    );

  return <DishDetail dish={data.dish} onBack={() => navigate(-1)} />;
}

/**
 * Route wrapper: renders DishForm for creating a new dish (/dishes/new).
 * Reads import prefill from router location state.
 */
export function DishFormNewRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: Partial<CreateDishData> } | null)?.prefill;
  return <DishForm prefill={prefill} onClose={() => navigate('/dishes')} />;
}

/**
 * Route wrapper: renders DishForm for editing an existing dish (/dishes/:dishId/edit).
 * Fetches the dish by ID then passes it to DishForm.
 */
export function DishFormEditRoute() {
  const { dishId } = useParams<{ dishId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => dishesApi.get(dishId!),
    enabled: !!dishId,
  });

  if (isLoading) return <SkeletonList count={3} />;
  if (isError || !data?.dish)
    return (
      <ErrorState message="Failed to load dish." error={error as Error} onRetry={() => refetch()} />
    );

  return <DishForm dish={data.dish} onClose={() => navigate(-1)} />;
}

export function DishDetail({ dish, onBack }: { dish: Dish; onBack: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [scaledServings, setScaledServings] = useState<number | null>(dish.servings ?? null);

  const { data: freshData } = useQuery({
    queryKey: ['dish', dish.id],
    queryFn: () => dishesApi.get(dish.id),
    initialData: { dish },
    staleTime: 30_000,
    refetchOnMount: false,
  });

  const currentDish = freshData?.dish || dish;

  // Fetch rating stats
  const { data: ratingData } = useQuery({
    queryKey: ['dishRating', dish.id],
    queryFn: () => ratingsApi.getDishStats(dish.id),
  });

  // Fetch preparation history
  const { data: historyData } = useQuery({
    queryKey: ['dishHistory', dish.id],
    queryFn: () => dishesApi.getPreparations(dish.id),
  });

  const stats = ratingData?.stats;
  const preparations = historyData?.preparations || [];

  const defaultServings = currentDish.servings ?? null;
  const scale = defaultServings && scaledServings ? scaledServings / defaultServings : 1;
  const isScaled = scale !== 1;

  const archiveMutation = useMutation({
    mutationFn: () => dishesApi.archive(dish.id),
    onSuccess: () => {
      toast.success('Dish archived');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      onBack();
    },
    onError: (error) => {
      toast.error('Failed to archive dish');
      console.error('Error archiving dish:', error);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => dishesApi.unarchive(dish.id),
    onSuccess: () => {
      toast.success('Dish unarchived');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      onBack();
    },
    onError: (error) => {
      toast.error('Failed to unarchive dish');
      console.error('Error unarchiving dish:', error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dishesApi.hardDelete(dish.id),
    onSuccess: () => {
      toast.success('Dish permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      onBack();
    },
    onError: (error) => {
      toast.error('Failed to delete dish');
      console.error('Error deleting dish:', error);
    },
  });

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-md">
          <ChevronRight className="h-5 w-5 rotate-180" />
        </button>
        <h1 className="text-2xl font-bold flex-1">{currentDish.name}</h1>
      </div>

      <div className="space-y-6">
        {/* Type badge + dietary tags */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">
            {currentDish.type === 'main' ? 'Main Dish' : 'Side Dish'}
          </span>
          {currentDish.dietaryTags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800"
            >
              {DIETARY_TAG_LABELS[tag] ?? tag}
            </span>
          ))}
        </div>

        {/* Description */}
        {currentDish.description && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-1">Description</h2>
            <p>{currentDish.description}</p>
          </div>
        )}

        {/* Time & Servings */}
        {(currentDish.prepTime || currentDish.cookTime || currentDish.servings) && (
          <div className="flex flex-wrap gap-4 text-sm">
            {currentDish.prepTime && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Prep:</span>
                <span className="font-medium">{currentDish.prepTime} min</span>
              </div>
            )}
            {currentDish.cookTime && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Cook:</span>
                <span className="font-medium">{currentDish.cookTime} min</span>
              </div>
            )}
            {currentDish.prepTime && currentDish.cookTime && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {currentDish.prepTime + currentDish.cookTime} min
                </span>
              </div>
            )}
            {currentDish.servings && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Servings:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setScaledServings((s) => Math.max(1, (s ?? currentDish.servings!) - 1))
                    }
                    className="w-6 h-6 flex items-center justify-center rounded border hover:bg-muted"
                    aria-label="Decrease servings"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="font-medium w-6 text-center">
                    {scaledServings ?? currentDish.servings}
                  </span>
                  <button
                    onClick={() => setScaledServings((s) => (s ?? currentDish.servings!) + 1)}
                    className="w-6 h-6 flex items-center justify-center rounded border hover:bg-muted"
                    aria-label="Increase servings"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {isScaled && (
                  <button
                    onClick={() => setScaledServings(currentDish.servings ?? null)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    reset
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Nutrition Facts */}
        {(currentDish.calories != null ||
          currentDish.proteinG != null ||
          currentDish.carbsG != null ||
          currentDish.fatG != null) && (
          <div>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Nutrition{defaultServings ? ' (per serving)' : ''}
              {isScaled && defaultServings ? ` · scaled to ${scaledServings}` : ''}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
              {currentDish.calories != null && (
                <span>
                  <span className="text-muted-foreground">Cal </span>
                  <span className="font-medium">
                    {Math.round(currentDish.calories * scale)} kcal
                  </span>
                </span>
              )}
              {currentDish.proteinG != null && (
                <span>
                  <span className="text-muted-foreground">Protein </span>
                  <span className="font-medium">{Math.round(currentDish.proteinG * scale)} g</span>
                </span>
              )}
              {currentDish.carbsG != null && (
                <span>
                  <span className="text-muted-foreground">Carbs </span>
                  <span className="font-medium">{Math.round(currentDish.carbsG * scale)} g</span>
                </span>
              )}
              {currentDish.fatG != null && (
                <span>
                  <span className="text-muted-foreground">Fat </span>
                  <span className="font-medium">{Math.round(currentDish.fatG * scale)} g</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Local Video Player */}
        {currentDish.localVideoFilename && (
          <VideoPlayer
            dishId={currentDish.id}
            thumbnailFilename={currentDish.videoThumbnailFilename}
            className="w-full"
          />
        )}

        {/* Source Links */}
        {(currentDish.sourceUrl || currentDish.videoUrl) && (
          <div className="flex flex-wrap gap-3">
            {currentDish.sourceUrl && (
              <a
                href={currentDish.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Recipe Source
              </a>
            )}
            {currentDish.videoUrl && (
              <a
                href={currentDish.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Watch Video
              </a>
            )}
          </div>
        )}

        {/* Ingredients */}
        {currentDish.ingredients.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Ingredients</h2>
            <ul className="space-y-1">
              {currentDish.ingredients.map((ing) => (
                <li key={ing.id} className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">-</span>
                  <span>
                    {ing.quantity != null ? (
                      <span className={cn(isScaled && 'font-medium')}>
                        {scaleQuantity(ing.quantity, scale)}{' '}
                      </span>
                    ) : isScaled ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-amber-500 mr-1"
                        title="Quantity not specified — cannot scale"
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    ) : null}
                    {ing.unit && `${ing.unit} `}
                    {ing.name}
                    {ing.notes && <span className="text-muted-foreground"> ({ing.notes})</span>}
                  </span>
                </li>
              ))}
            </ul>
            {isScaled && currentDish.ingredients.some((i) => i.quantity == null) && (
              <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Some ingredients have no quantity and cannot be scaled.
              </p>
            )}
          </div>
        )}

        {/* Instructions */}
        {currentDish.instructions && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Instructions</h2>
            <div className="whitespace-pre-wrap">{currentDish.instructions}</div>
          </div>
        )}

        {/* Cook Notes */}
        <DishNotes dishId={currentDish.id} />

        {/* Tags */}
        {currentDish.tags.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {currentDish.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-sm rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Rating stats */}
        {stats && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Rating</h2>
            <AverageRating average={stats.averageRating} count={stats.totalRatings} size="md" />
          </div>
        )}

        {/* Preparation history */}
        {preparations.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChefHat className="h-4 w-4" />
              Preparation History ({preparations.length})
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', showHistory && 'rotate-90')}
              />
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {preparations.slice(0, 10).map((prep) => (
                  <div key={prep.id} className="p-2 bg-muted/50 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {prep.preparers.map((p) => p.name).join(' & ')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(prep.preparedDate).toLocaleDateString()}
                      </span>
                    </div>
                    {prep.notes && <p className="text-muted-foreground mt-1">{prep.notes}</p>}
                  </div>
                ))}
                {preparations.length > 10 && (
                  <p className="text-sm text-muted-foreground">
                    ...and {preparations.length - 10} more
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={() => navigate(`/dishes/${dish.id}/edit`)}
            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                       font-medium hover:bg-primary/90"
          >
            Edit
          </button>
          {currentDish.archived ? (
            <>
              <button
                onClick={() => unarchiveMutation.mutate()}
                disabled={unarchiveMutation.isPending}
                className="py-2 px-4 border rounded-md hover:bg-muted flex items-center gap-2"
              >
                <ArchiveRestore className="h-4 w-4" />
                Restore
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="py-2 px-4 border rounded-md hover:bg-destructive/10 flex items-center gap-2
                             text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="py-2 px-4 border rounded-md hover:bg-muted flex items-center gap-2
                         text-destructive hover:text-destructive"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Permanently Delete Dish"
        description={`Are you sure you want to permanently delete "${currentDish.name}"? This will remove all history, ratings, and preparations for this dish. This action cannot be undone.`}
        confirmText="Delete Permanently"
        variant="destructive"
        onConfirm={() => {
          setShowDeleteDialog(false);
          deleteMutation.mutate();
        }}
        onCancel={() => setShowDeleteDialog(false)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

const INGREDIENT_CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Bakery',
  'Frozen',
  'Pantry Staples',
  'Beverages',
  'Household',
  'Other',
] as const;

interface IngredientRow {
  quantity: string;
  unit: string;
  name: string;
  notes: string;
  category: string;
  storeIds: string[];
}

interface DishFormProps {
  dish?: Dish;
  prefill?: Partial<CreateDishData>;
  onClose: () => void;
}

export function DishForm({ dish, prefill, onClose }: DishFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!dish;

  const [name, setName] = useState(dish?.name ?? prefill?.name ?? '');
  const [description, setDescription] = useState(dish?.description ?? prefill?.description ?? '');
  const [type, setType] = useState<'main' | 'side'>(dish?.type ?? prefill?.type ?? 'main');
  const [instructions, setInstructions] = useState(
    dish?.instructions ?? prefill?.instructions ?? ''
  );
  const [prepTime, setPrepTime] = useState<string>(
    dish?.prepTime?.toString() ?? prefill?.prepTime?.toString() ?? ''
  );
  const [cookTime, setCookTime] = useState<string>(
    dish?.cookTime?.toString() ?? prefill?.cookTime?.toString() ?? ''
  );
  const [servings, setServings] = useState<string>(
    dish?.servings?.toString() ?? prefill?.servings?.toString() ?? ''
  );
  const [calories, setCalories] = useState<string>(
    dish?.calories?.toString() ?? prefill?.calories?.toString() ?? ''
  );
  const [proteinG, setProteinG] = useState<string>(
    dish?.proteinG?.toString() ?? prefill?.proteinG?.toString() ?? ''
  );
  const [carbsG, setCarbsG] = useState<string>(
    dish?.carbsG?.toString() ?? prefill?.carbsG?.toString() ?? ''
  );
  const [fatG, setFatG] = useState<string>(
    dish?.fatG?.toString() ?? prefill?.fatG?.toString() ?? ''
  );
  const [sourceUrl, setSourceUrl] = useState(dish?.sourceUrl ?? prefill?.sourceUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(dish?.videoUrl ?? prefill?.videoUrl ?? '');
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const videoDialogCloseRef = useRef<HTMLButtonElement>(null);
  const videoThumbnailRef = useRef<HTMLButtonElement>(null);
  const wasVideoDialogOpen = useRef(false);
  useEffect(() => {
    if (videoDialogOpen) {
      wasVideoDialogOpen.current = true;
      videoDialogCloseRef.current?.focus();
    } else if (wasVideoDialogOpen.current) {
      wasVideoDialogOpen.current = false;
      videoThumbnailRef.current?.focus();
    }
  }, [videoDialogOpen]);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>(
    dish?.ingredients.map((i) => ({
      quantity: i.quantity?.toString() ?? '',
      unit: i.unit ?? '',
      name: i.name,
      notes: i.notes ?? '',
      category: i.category ?? 'Other',
      // storeIds will be resolved once stores data loads (see useEffect below)
      storeIds: [],
    })) ??
      prefill?.ingredients?.map((i) => ({
        quantity: i.quantity?.toString() ?? '',
        unit: i.unit ?? '',
        name: i.name,
        notes: i.notes ?? '',
        category: 'Other',
        storeIds: [],
      })) ??
      []
  );
  const [tags, setTags] = useState<string[]>(dish?.tags ?? prefill?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [dietaryTags, setDietaryTags] = useState<string[]>(dish?.dietaryTags ?? []);

  function addTag(value: string) {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function addIngredientRow() {
    setIngredientRows((prev) => [
      ...prev,
      { quantity: '', unit: '', name: '', notes: '', category: 'Other', storeIds: [] },
    ]);
  }

  function removeIngredientRow(index: number) {
    setIngredientRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateIngredientRow(
    index: number,
    field: Exclude<keyof IngredientRow, 'storeIds'>,
    value: string
  ) {
    setIngredientRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function updateIngredientStores(index: number, storeIds: string[]) {
    setIngredientRows((prev) => prev.map((row, i) => (i === index ? { ...row, storeIds } : row)));
  }

  function moveIngredientRow(index: number, direction: 'up' | 'down') {
    setIngredientRows((prev) => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }

  const { data: storesList } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.list,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve store names → IDs for existing dish ingredients (runs once when stores load)
  const storesResolved = useRef(false);
  useEffect(() => {
    if (!storesList || storesResolved.current || !dish?.ingredients.length) return;
    storesResolved.current = true;
    const nameToId = new Map(storesList.map((s: Store) => [s.name, s.id]));
    setIngredientRows((prev) =>
      prev.map((row, i) => {
        const ing = dish.ingredients[i];
        if (!ing) return row;
        const resolvedIds = (ing.stores ?? [])
          .map((name: string) => nameToId.get(name))
          .filter((id): id is string => id !== undefined);
        return { ...row, storeIds: resolvedIds };
      })
    );
  }, [storesList, dish]);

  // Per-ingredient store input state (for the combobox)
  const [storeInputs, setStoreInputs] = useState<Record<number, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: CreateDishData) => dishesApi.create(data),
    onSuccess: () => {
      toast.success('Dish created successfully');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to create dish');
      console.error('Error creating dish:', error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateDishData>) => dishesApi.update(dish!.id, data),
    onSuccess: () => {
      toast.success('Dish updated successfully');
      queryClient.invalidateQueries({ queryKey: ['dishes'] });
      queryClient.invalidateQueries({ queryKey: ['dish', dish!.id] });
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to update dish');
      console.error('Error updating dish:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build ingredients from structured rows
    const ingredients = ingredientRows
      .filter((row) => row.name.trim())
      .map((row) => ({
        quantity: row.quantity ? parseFloat(row.quantity) : null,
        unit: row.unit.trim() || null,
        name: row.name.trim(),
        notes: row.notes.trim() || null,
        category: row.category || 'Other',
        storeIds: row.storeIds,
      }));

    const data: CreateDishData = {
      name,
      description,
      type,
      instructions,
      prepTime: prepTime ? parseInt(prepTime, 10) : null,
      cookTime: cookTime ? parseInt(cookTime, 10) : null,
      servings: servings ? parseInt(servings, 10) : null,
      calories: calories ? parseFloat(calories) : null,
      proteinG: proteinG ? parseFloat(proteinG) : null,
      carbsG: carbsG ? parseFloat(carbsG) : null,
      fatG: fatG ? parseFloat(fatG) : null,
      sourceUrl: sourceUrl || null,
      videoUrl: videoUrl || null,
      ingredients,
      tags,
      dietaryTags,
    };

    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-md">
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{isEditing ? 'Edit Dish' : 'New Dish'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md bg-background"
            placeholder="Dish name"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Type *</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('main')}
              className={cn(
                'flex-1 py-2 px-4 rounded-md border text-sm font-medium',
                type === 'main'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              Main Dish
            </button>
            <button
              type="button"
              onClick={() => setType('side')}
              className={cn(
                'flex-1 py-2 px-4 rounded-md border text-sm font-medium',
                type === 'side'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              Side Dish
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border rounded-md bg-background resize-none"
            placeholder="Brief description"
          />
        </div>

        {/* Time & Servings */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Prep Time</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="30"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cook Time</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="45"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Servings</label>
            <input
              type="number"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              min="1"
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="4"
            />
          </div>
        </div>

        {/* Nutrition (optional) */}
        <div>
          <p className="text-sm font-medium mb-2">
            Nutrition{' '}
            <span className="text-muted-foreground font-normal">(optional, per serving)</span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="form-calories">
                Calories
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="form-calories"
                  type="number"
                  name="calories"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  min="0"
                  step="any"
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground shrink-0">kcal</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="form-protein">
                Protein
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="form-protein"
                  type="number"
                  name="proteinG"
                  value={proteinG}
                  onChange={(e) => setProteinG(e.target.value)}
                  min="0"
                  step="any"
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground shrink-0">g</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="form-carbs">
                Carbs
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="form-carbs"
                  type="number"
                  name="carbsG"
                  value={carbsG}
                  onChange={(e) => setCarbsG(e.target.value)}
                  min="0"
                  step="any"
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground shrink-0">g</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="form-fat">
                Fat
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="form-fat"
                  type="number"
                  name="fatG"
                  value={fatG}
                  onChange={(e) => setFatG(e.target.value)}
                  min="0"
                  step="any"
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground shrink-0">g</span>
              </div>
            </div>
          </div>
        </div>

        {/* Local video thumbnail */}
        {isEditing && dish?.localVideoFilename && (
          <div>
            <label className="block text-sm font-medium mb-1">Video Preview</label>
            <button
              ref={videoThumbnailRef}
              type="button"
              onClick={() => setVideoDialogOpen(true)}
              className="relative block w-32 h-20 rounded-md border overflow-hidden bg-muted hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open video player"
            >
              {dish.videoThumbnailFilename ? (
                <img
                  src={`/videos/${dish.videoThumbnailFilename}`}
                  alt="Video thumbnail"
                  width={128}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span aria-hidden="true" className="flex h-full w-full items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </span>
              )}
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center bg-black/30"
              >
                <Video className="h-6 w-6 text-white" />
              </span>
            </button>
          </div>
        )}

        {/* Video dialog */}
        {videoDialogOpen && dish && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-label="Video player"
            onClick={(e) => {
              if (e.target === e.currentTarget) setVideoDialogOpen(false);
            }}
          >
            <div className="relative w-full max-w-2xl">
              <button
                ref={videoDialogCloseRef}
                type="button"
                onClick={() => setVideoDialogOpen(false)}
                className="absolute -top-10 right-0 p-2 text-white hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
                aria-label="Close video player"
              >
                <X className="h-6 w-6" />
              </button>
              <VideoPlayer dishId={dish.id} thumbnailFilename={dish.videoThumbnailFilename} />
            </div>
          </div>
        )}

        {/* URLs */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Recipe Source URL</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="https://example.com/recipe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Video URL</label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <label className="block text-sm font-medium mb-1">Ingredients</label>
          <div className="space-y-2">
            {ingredientRows.map((row, index) => (
              <div key={index} className="border rounded-md p-2 bg-background space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => updateIngredientRow(index, 'quantity', e.target.value)}
                    placeholder="Qty"
                    min="0"
                    step="any"
                    className="w-14 px-2 py-1.5 border rounded text-sm bg-background"
                    aria-label="Quantity"
                  />
                  <input
                    type="text"
                    value={row.unit}
                    onChange={(e) => updateIngredientRow(index, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-20 px-2 py-1.5 border rounded text-sm bg-background"
                    aria-label="Unit"
                  />
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateIngredientRow(index, 'name', e.target.value)}
                    placeholder="Ingredient name *"
                    required={false}
                    className="flex-1 px-2 py-1.5 border rounded text-sm bg-background"
                    aria-label="Ingredient name"
                  />
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveIngredientRow(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveIngredientRow(index, 'down')}
                      disabled={index === ingredientRows.length - 1}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIngredientRow(index)}
                    className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded shrink-0"
                    aria-label="Remove ingredient"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={row.notes}
                  onChange={(e) => updateIngredientRow(index, 'notes', e.target.value)}
                  placeholder="Notes (optional, e.g. finely chopped)"
                  className="w-full px-2 py-1 border rounded text-xs bg-background text-muted-foreground"
                  aria-label="Notes"
                />
                {/* Category + Stores row */}
                <div className="flex flex-wrap items-start gap-1.5">
                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`ingredient-category-${index}`}
                    >
                      Category:
                    </label>
                    <select
                      id={`ingredient-category-${index}`}
                      value={row.category}
                      onChange={(e) => updateIngredientRow(index, 'category', e.target.value)}
                      className="px-1.5 py-0.5 border rounded text-xs bg-background"
                      aria-label="Ingredient category"
                    >
                      {INGREDIENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Store multi-select */}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-muted-foreground">Stores:</label>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {row.storeIds.map((id) => {
                        const storeName = storesList?.find((s: Store) => s.id === id)?.name ?? id;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground border"
                          >
                            {storeName}
                            <button
                              type="button"
                              onClick={() =>
                                updateIngredientStores(
                                  index,
                                  row.storeIds.filter((sid) => sid !== id)
                                )
                              }
                              className="p-0.5 hover:text-destructive"
                              aria-label={`Remove store ${storeName}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                      <input
                        type="text"
                        value={storeInputs[index] ?? ''}
                        onChange={(e) =>
                          setStoreInputs((prev) => ({ ...prev, [index]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const inputVal = (storeInputs[index] ?? '').trim();
                            if (!inputVal) return;
                            // Match existing store by name (case-insensitive)
                            const match = storesList?.find(
                              (s: Store) => s.name.toLowerCase() === inputVal.toLowerCase()
                            );
                            if (match && !row.storeIds.includes(match.id)) {
                              updateIngredientStores(index, [...row.storeIds, match.id]);
                            }
                            setStoreInputs((prev) => ({ ...prev, [index]: '' }));
                          }
                        }}
                        placeholder={row.storeIds.length === 0 ? 'Type store name…' : ''}
                        list={`stores-list-${index}`}
                        className="flex-1 min-w-[100px] px-1.5 py-0.5 border rounded text-xs bg-background"
                        aria-label="Add store"
                      />
                      <datalist id={`stores-list-${index}`}>
                        {(storesList ?? [])
                          .filter((s: Store) => !row.storeIds.includes(s.id))
                          .map((s: Store) => (
                            <option key={s.id} value={s.name} />
                          ))}
                      </datalist>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addIngredientRow}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed rounded-md px-3 py-2 w-full hover:bg-muted transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add ingredient
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-sm font-medium mb-1">Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border rounded-md bg-background resize-none"
            placeholder="Cooking instructions..."
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <div
            className="flex flex-wrap gap-1.5 px-2 py-2 border rounded-md bg-background min-h-[42px] cursor-text"
            onClick={() => document.getElementById('tag-input')?.focus()}
          >
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-destructive"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <input
              id="tag-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => addTag(tagInput)}
              className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
              placeholder={tags.length === 0 ? 'Type a tag and press Enter' : ''}
              aria-label="Add tag"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter or comma to add · Backspace to remove last
          </p>
        </div>

        {/* Dietary Tags */}
        <fieldset>
          <legend className="block text-sm font-medium mb-2">Dietary Tags</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DIETARY_TAGS.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-2 text-sm cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={dietaryTags.includes(tag)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDietaryTags((prev) => [...prev, tag]);
                    } else {
                      setDietaryTags((prev) => prev.filter((t) => t !== tag));
                    }
                  }}
                  className="rounded border-input"
                />
                {DIETARY_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={isPending || !name}
            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                       font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Dish'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
