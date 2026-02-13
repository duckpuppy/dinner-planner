import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dishes as dishesApi,
  ratings as ratingsApi,
  type Dish,
  type CreateDishData,
} from '@/lib/api';
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
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AverageRating } from '@/components/StarRating';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuthStore } from '@/stores/auth';

type SortOption = 'name' | 'rating' | 'recent' | 'created';

export function DishesPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dishes', { archived: String(showArchived) }],
    queryFn: () => dishesApi.list({ archived: String(showArchived), limit: '100' }),
  });

  const dishes = data?.dishes || [];

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
  }, [dishes, searchQuery, selectedTag, sortBy]);

  const mainDishes = filteredDishes.filter((d) => d.type === 'main');
  const sideDishes = filteredDishes.filter((d) => d.type === 'side');

  if (selectedDish) {
    return <DishDetail dish={selectedDish} onBack={() => setSelectedDish(null)} />;
  }

  if (isCreating) {
    return <DishForm onClose={() => setIsCreating(false)} />;
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dishes</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          aria-label="Add dish"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

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
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : dishes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{showArchived ? 'No archived dishes' : 'No dishes yet'}</p>
          {!showArchived && (
            <button
              onClick={() => setIsCreating(true)}
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
              <div className="space-y-1">
                {mainDishes.map((dish) => (
                  <DishRow key={dish.id} dish={dish} onClick={() => setSelectedDish(dish)} />
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
              <div className="space-y-1">
                {sideDishes.map((dish) => (
                  <DishRow key={dish.id} dish={dish} onClick={() => setSelectedDish(dish)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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

function DishDetail({ dish, onBack }: { dish: Dish; onBack: () => void }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: freshData } = useQuery({
    queryKey: ['dish', dish.id],
    queryFn: () => dishesApi.get(dish.id),
    initialData: { dish },
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

  if (isEditing) {
    return <DishForm dish={currentDish} onClose={() => setIsEditing(false)} />;
  }

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
        {/* Type badge */}
        <div>
          <span className="inline-block px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground">
            {currentDish.type === 'main' ? 'Main Dish' : 'Side Dish'}
          </span>
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
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Servings:</span>
                <span className="font-medium">{currentDish.servings}</span>
              </div>
            )}
          </div>
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
                  <span className="text-muted-foreground">-</span>
                  <span>
                    {ing.quantity && `${ing.quantity} `}
                    {ing.unit && `${ing.unit} `}
                    {ing.name}
                    {ing.notes && <span className="text-muted-foreground"> ({ing.notes})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Instructions */}
        {currentDish.instructions && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Instructions</h2>
            <div className="whitespace-pre-wrap">{currentDish.instructions}</div>
          </div>
        )}

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
                      <span className="font-medium">{prep.preparedByName}</span>
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
            onClick={() => setIsEditing(true)}
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

interface DishFormProps {
  dish?: Dish;
  onClose: () => void;
}

function DishForm({ dish, onClose }: DishFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!dish;

  const [name, setName] = useState(dish?.name || '');
  const [description, setDescription] = useState(dish?.description || '');
  const [type, setType] = useState<'main' | 'side'>(dish?.type || 'main');
  const [instructions, setInstructions] = useState(dish?.instructions || '');
  const [prepTime, setPrepTime] = useState<string>(dish?.prepTime?.toString() || '');
  const [cookTime, setCookTime] = useState<string>(dish?.cookTime?.toString() || '');
  const [servings, setServings] = useState<string>(dish?.servings?.toString() || '');
  const [sourceUrl, setSourceUrl] = useState(dish?.sourceUrl || '');
  const [videoUrl, setVideoUrl] = useState(dish?.videoUrl || '');
  const [ingredientsText, setIngredientsText] = useState(
    dish?.ingredients
      .map((i) =>
        `${i.quantity || ''} ${i.unit || ''} ${i.name}${i.notes ? ` (${i.notes})` : ''}`.trim()
      )
      .join('\n') || ''
  );
  const [tagsText, setTagsText] = useState(dish?.tags.join(', ') || '');

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

    // Parse ingredients (simple format: one per line)
    const ingredients = ingredientsText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => ({
        quantity: null,
        unit: null,
        name: line.trim(),
        notes: null,
      }));

    // Parse tags
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const data: CreateDishData = {
      name,
      description,
      type,
      instructions,
      prepTime: prepTime ? parseInt(prepTime, 10) : null,
      cookTime: cookTime ? parseInt(cookTime, 10) : null,
      servings: servings ? parseInt(servings, 10) : null,
      sourceUrl: sourceUrl || null,
      videoUrl: videoUrl || null,
      ingredients,
      tags,
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
          <textarea
            value={ingredientsText}
            onChange={(e) => setIngredientsText(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 border rounded-md bg-background resize-none font-mono text-sm"
            placeholder="One ingredient per line"
          />
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
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
            placeholder="comma, separated, tags"
          />
        </div>

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
