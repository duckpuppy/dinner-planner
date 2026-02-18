import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menus, dishes, type DinnerEntry, type UpdateEntryData } from '@/lib/api';
import { ChevronLeft, ChevronRight, Check, X, Edit2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

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

function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

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

  const currentWeekStart = useMemo(() => {
    const today = new Date();
    const weekStart = getWeekStartDate(today);
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);
    return weekStart;
  }, [weekOffset]);

  const dateStr = formatDateForApi(currentWeekStart);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['week', dateStr],
    queryFn: () => menus.getWeek(dateStr),
  });

  const {
    activeItemId,
    openSwipe,
    closeSwipe,
  } = useSwipeActions();

  const goToPrevWeek = () => setWeekOffset((o) => o - 1);
  const goToNextWeek = () => setWeekOffset((o) => o + 1);
  const goToToday = () => setWeekOffset(0);

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
            onClick={goToPrevWeek}
            className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={goToToday} className="px-3 py-2 text-sm hover:bg-muted rounded-md touch-manipulation">
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
  const queryClient = useQueryClient();

  const isToday = entry.date === formatDateForApi(new Date());
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
          'border rounded-lg p-3 flex items-center gap-4',
          isToday && 'ring-2 ring-primary',
          entry.completed && 'bg-muted/50'
        )}
      >
      {/* Date */}
      <div className="w-16 text-center flex-shrink-0">
        <div className="text-xs text-muted-foreground">{DAY_NAMES[entry.dayOfWeek]}</div>
        <div className={cn('text-2xl font-bold', isToday && 'text-primary')}>{date.getDate()}</div>
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
          <div className="text-muted-foreground">{entry.customText || 'Dining Out'}</div>
        ) : (
          <div className="text-muted-foreground">{entry.customText || 'Custom'}</div>
        )}
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {entry.completed && (
          <span className="text-green-600 dark:text-green-400">
            <Check className="h-5 w-5" />
          </span>
        )}
        <button
          onClick={() => setIsEditing(true)}
          className="p-3 md:p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground touch-manipulation"
          aria-label="Edit"
        >
          <Edit2 className="h-4 w-4" />
        </button>
      </div>
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

  const { data: dishesData } = useQuery({
    queryKey: ['dishes', { archived: 'false' }],
    queryFn: () => dishes.list({ archived: 'false', limit: '100' }),
  });

  const allDishes = dishesData?.dishes || [];
  const mainDishes = allDishes.filter((d) => d.type === 'main');
  const sideDishes = allDishes.filter((d) => d.type === 'side');

  const date = new Date(entry.date + 'T00:00:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type,
      mainDishId: type === 'assembled' ? mainDishId || null : null,
      sideDishIds: type === 'assembled' ? sideDishIds : [],
      customText: ['dining_out', 'custom'].includes(type) ? customText || null : null,
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { value: 'assembled', label: 'Home Cooked' },
          { value: 'fend_for_self', label: 'Fend' },
          { value: 'dining_out', label: 'Dining Out' },
          { value: 'custom', label: 'Custom' },
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
            <label className="block text-sm font-medium mb-1">Main Dish</label>
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

      {/* Custom text for dining out / custom */}
      {['dining_out', 'custom'].includes(type) && (
        <div>
          <label className="block text-sm font-medium mb-1">
            {type === 'dining_out' ? 'Restaurant / Notes' : 'Description'}
          </label>
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={type === 'dining_out' ? 'Where are you going?' : 'What are you having?'}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
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
