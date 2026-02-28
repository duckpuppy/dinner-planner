import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  menus,
  dishes,
  patterns,
  prepTasks,
  type DinnerEntry,
  type UpdateEntryData,
  type SuggestedDish,
} from '@/lib/api';
import { PrepTaskList } from '@/components/PrepTaskList';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Edit2,
  Sparkles,
  ShoppingCart,
  Zap,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CalendarOff,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn, localDateStr } from '@/lib/utils';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { SuggestionModal } from '@/components/SuggestionModal';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function WeekPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const currentWeekStart = useMemo(() => {
    const today = new Date();
    const weekStart = getWeekStartDate(today);
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);
    return weekStart;
  }, [weekOffset]);

  const dateStr = localDateStr(currentWeekStart);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['week', dateStr],
    queryFn: () => menus.getWeek(dateStr),
  });

  const { activeItemId, openSwipe, closeSwipe } = useSwipeActions();

  const goToPrevWeek = () => setWeekOffset((o) => o - 1);
  const goToNextWeek = () => setWeekOffset((o) => o + 1);
  const goToToday = () => setWeekOffset(0);

  const applyPatternsMutation = useMutation({
    mutationFn: () => patterns.applyToWeek(dateStr),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['week', dateStr] });
      toast.success(`Applied ${data.applied} pattern${data.applied !== 1 ? 's' : ''} to week`);
    },
    onError: () => toast.error('Failed to apply patterns'),
  });

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
          <h1 className="text-2xl font-bold">{formatMonthYear(currentWeekStart)}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyPatternsMutation.mutate()}
              disabled={applyPatternsMutation.isPending}
              className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation disabled:opacity-50"
              aria-label="Apply recurring patterns"
              title="Apply recurring patterns"
            >
              <Zap className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate(`/grocery?date=${dateStr}`)}
              className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation"
              aria-label="Grocery list"
              title="Grocery list"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
            <button
              onClick={goToPrevWeek}
              className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-2 text-sm hover:bg-muted rounded-md touch-manipulation"
            >
              Today
            </button>
            <button
              onClick={goToNextWeek}
              className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation"
              aria-label="Next week"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Week grid */}
        {isLoading ? (
          <SkeletonList count={7} />
        ) : isError ? (
          <ErrorState
            message="Failed to load week menu. Please try again."
            error={error as Error}
            onRetry={() => refetch()}
          />
        ) : (
          <div className="space-y-2">
            {data?.menu.entries.map((entry) => (
              <DayCard
                key={entry.id}
                entry={entry}
                activeItemId={activeItemId}
                onSwipeStart={openSwipe}
                onSwipeEnd={closeSwipe}
              />
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

interface DayCardProps {
  entry: DinnerEntry;
  activeItemId: string | null;
  onSwipeStart: (itemId: string) => void;
  onSwipeEnd: () => void;
}

function DayCard({ entry, activeItemId, onSwipeStart, onSwipeEnd }: DayCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPrepTasks, setShowPrepTasks] = useState(false);
  const queryClient = useQueryClient();

  const { data: prepTasksData } = useQuery({
    queryKey: ['prepTasks', entry.id],
    queryFn: () => prepTasks.list(entry.id),
  });

  const prepTaskCount = prepTasksData?.prepTasks.length ?? 0;
  const completedCount = prepTasksData?.prepTasks.filter((t) => t.completed).length ?? 0;

  const isToday = entry.date === localDateStr();
  const date = new Date(entry.date + 'T00:00:00');

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEntryData) => menus.updateEntry(entry.id, data),
    onSuccess: () => {
      toast.success('Dinner updated successfully');
      queryClient.invalidateQueries({ queryKey: ['week'] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error('Failed to update dinner');
      console.error('Error updating entry:', error);
    },
  });

  if (isEditing) {
    return (
      <EntryEditor
        entry={entry}
        onSave={(data) => updateMutation.mutate(data)}
        onCancel={() => setIsEditing(false)}
        isSaving={updateMutation.isPending}
      />
    );
  }

  return (
    <SwipeableListItem
      itemId={entry.id}
      activeItemId={activeItemId}
      onSwipeStart={onSwipeStart}
      onSwipeEnd={onSwipeEnd}
      actions={[
        {
          label: 'Edit',
          icon: Edit2,
          color: 'secondary',
          onAction: () => setIsEditing(true),
        },
      ]}
    >
      <div
        className={cn(
          'border rounded-lg overflow-hidden',
          isToday && 'ring-2 ring-primary',
          entry.completed && 'bg-muted/50'
        )}
      >
        {/* Main card row */}
        <div className="p-3 flex items-center gap-4">
          {/* Date */}
          <div className="w-16 text-center flex-shrink-0">
            <div className="text-xs text-muted-foreground">{DAY_NAMES[entry.dayOfWeek]}</div>
            <div className={cn('text-2xl font-bold tabular-nums', isToday && 'text-primary')}>
              {date.getDate()}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {entry.type === 'assembled' && entry.mainDish ? (
              <>
                <div className="font-medium truncate">{entry.mainDish.name}</div>
                {entry.sideDishes.length > 0 && (
                  <div className="text-sm text-muted-foreground truncate">
                    with {entry.sideDishes.map((d) => d.name).join(', ')}
                  </div>
                )}
              </>
            ) : entry.type === 'assembled' ? (
              <div className="text-muted-foreground">No dish selected</div>
            ) : entry.type === 'fend_for_self' ? (
              <div className="text-muted-foreground">Fend for Yourself</div>
            ) : entry.type === 'dining_out' ? (
              <div className="text-muted-foreground">
                {entry.restaurantName || entry.customText
                  ? `Dining Out: ${entry.restaurantName || entry.customText}`
                  : 'Dining Out'}
                {entry.restaurantNotes && (
                  <div className="text-xs truncate">{entry.restaurantNotes}</div>
                )}
              </div>
            ) : entry.type === 'leftovers' ? (
              <div className="text-muted-foreground">
                {entry.sourceEntryDishName
                  ? `Leftovers from ${entry.sourceEntryDishName}`
                  : 'Leftovers'}
              </div>
            ) : (
              <div className="text-muted-foreground">{entry.customText || 'Custom'}</div>
            )}
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {entry.completed && (
              <span className="text-green-600 dark:text-green-400">
                <Check className="h-5 w-5" />
              </span>
            )}
            {/* Prep tasks toggle */}
            <button
              onClick={() => setShowPrepTasks((v) => !v)}
              className={cn(
                'p-3 md:p-2 rounded-md touch-manipulation flex items-center gap-1',
                showPrepTasks
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-label={showPrepTasks ? 'Hide prep tasks' : 'Show prep tasks'}
              aria-expanded={showPrepTasks}
            >
              <ClipboardList className="h-4 w-4" />
              {prepTaskCount > 0 && (
                <span className="text-xs tabular-nums font-medium">
                  {completedCount}/{prepTaskCount}
                </span>
              )}
              {showPrepTasks ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="p-3 md:p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground touch-manipulation"
              aria-label="Edit"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Prep tasks panel */}
        {showPrepTasks && (
          <div className="px-3 pb-3 pt-1 border-t">
            <PrepTaskList entryId={entry.id} />
          </div>
        )}
      </div>
    </SwipeableListItem>
  );
}

interface EntryEditorProps {
  entry: DinnerEntry;
  onSave: (data: UpdateEntryData) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function EntryEditor({ entry, onSave, onCancel, isSaving }: EntryEditorProps) {
  const [type, setType] = useState(entry.type);
  const [mainDishId, setMainDishId] = useState(entry.mainDish?.id || '');
  const [sideDishIds, setSideDishIds] = useState<string[]>(entry.sideDishes.map((d) => d.id));
  const [customText, setCustomText] = useState(entry.customText || '');
  const [restaurantName, setRestaurantName] = useState(
    entry.restaurantName ?? (entry.type === 'dining_out' ? entry.customText : null) ?? ''
  );
  const [restaurantNotes, setRestaurantNotes] = useState(entry.restaurantNotes || '');
  const [sourceEntryId, setSourceEntryId] = useState(entry.sourceEntryId || '');
  const [showSuggest, setShowSuggest] = useState(false);

  const { data: recentCompletedData } = useQuery({
    queryKey: ['recentCompleted'],
    queryFn: () => menus.recentCompleted(),
    enabled: type === 'leftovers',
  });

  const { data: dishesData } = useQuery({
    queryKey: ['dishes', { archived: 'false' }],
    queryFn: () => dishes.list({ archived: 'false', limit: '100' }),
  });

  const allDishes = dishesData?.dishes || [];
  const mainDishes = allDishes.filter((d) => d.type === 'main');
  const sideDishes = allDishes.filter((d) => d.type === 'side');
  const availableTags = useMemo(
    () => Array.from(new Set(mainDishes.flatMap((d) => d.tags))).sort(),
    [mainDishes]
  );

  function handleSuggestionSelect(dish: SuggestedDish) {
    setMainDishId(dish.id);
    setShowSuggest(false);
  }

  const date = new Date(entry.date + 'T00:00:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type,
      mainDishId: type === 'assembled' ? mainDishId || null : null,
      sideDishIds: type === 'assembled' ? sideDishIds : [],
      customText: type === 'custom' ? customText || null : null,
      restaurantName: type === 'dining_out' ? restaurantName || null : null,
      restaurantNotes: type === 'dining_out' ? restaurantNotes || null : null,
      sourceEntryId: type === 'leftovers' ? sourceEntryId || null : null,
    });
  };

  const toggleSideDish = (id: string) => {
    setSideDishIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {DAY_NAMES_FULL[entry.dayOfWeek]}, {date.toLocaleDateString()}
        </h3>
        <button type="button" onClick={onCancel} className="p-1 hover:bg-muted rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { value: 'assembled', label: 'Home Cooked' },
          { value: 'fend_for_self', label: 'Fend' },
          { value: 'dining_out', label: 'Dining Out' },
          { value: 'custom', label: 'Custom' },
          { value: 'leftovers', label: 'Leftovers' },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value as typeof type)}
            className={cn(
              'py-2 px-3 rounded-md text-sm font-medium border',
              type === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-muted border-input'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Dish selector for assembled */}
      {type === 'assembled' && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Main Dish</label>
              <button
                type="button"
                onClick={() => setShowSuggest(true)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Suggest
              </button>
            </div>
            <select
              value={mainDishId}
              onChange={(e) => setMainDishId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Select a main dish...</option>
              {mainDishes.map((dish) => (
                <option key={dish.id} value={dish.id}>
                  {dish.name}
                </option>
              ))}
            </select>
          </div>
          <SuggestionModal
            open={showSuggest}
            availableTags={availableTags}
            onSelect={handleSuggestionSelect}
            onClose={() => setShowSuggest(false)}
          />

          {sideDishes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Side Dishes</label>
              <div className="flex flex-wrap gap-2">
                {sideDishes.map((dish) => (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => toggleSideDish(dish.id)}
                    className={cn(
                      'py-1 px-3 rounded-full text-sm border',
                      sideDishIds.includes(dish.id)
                        ? 'bg-secondary text-secondary-foreground border-secondary'
                        : 'hover:bg-muted border-input'
                    )}
                  >
                    {dish.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dining out fields */}
      {type === 'dining_out' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Restaurant Name</label>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Where are you going?"
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              type="text"
              value={restaurantNotes}
              onChange={(e) => setRestaurantNotes(e.target.value)}
              placeholder="Reservation, what you're ordering..."
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>
      )}

      {/* Custom text */}
      {type === 'custom' && (
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="What are you having?"
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
      )}

      {/* Leftovers source picker */}
      {type === 'leftovers' && (
        <div>
          <label htmlFor="source-entry" className="block text-sm font-medium mb-1">
            Leftovers from...
          </label>
          {recentCompletedData && recentCompletedData.length > 0 ? (
            <select
              id="source-entry"
              value={sourceEntryId}
              onChange={(e) => setSourceEntryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Select a source meal...</option>
              {recentCompletedData.map((recent) => {
                const d = new Date(recent.date + 'T00:00:00');
                const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
                const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                return (
                  <option key={recent.id} value={recent.id}>
                    {dayName}, {dateStr} — {recent.mainDishName}
                  </option>
                );
              })}
            </select>
          ) : recentCompletedData ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 border rounded-md bg-background">
              <CalendarOff className="h-4 w-4" aria-hidden="true" />
              No recent meals found
            </div>
          ) : (
            <div className="px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground">
              Loading recent meals...
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                     font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-2 px-4 border rounded-md hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
