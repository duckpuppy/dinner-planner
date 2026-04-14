import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  menus,
  patterns,
  prepTasks,
  settings,
  type DinnerEntry,
  type UpdateEntryData,
} from '@/lib/api';
import { PrepTaskList } from '@/components/PrepTaskList';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Edit2,
  ShoppingCart,
  Zap,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn, localDateStr, getWeekStartDate } from '@/lib/utils';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EntryEditor } from '@/components/EntryEditor';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function WeekPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settings.get(),
  });
  const weekStartDay = settingsData?.settings.weekStartDay ?? 0;

  const currentWeekStart = useMemo(() => {
    const today = new Date();
    const weekStart = getWeekStartDate(today, weekStartDay);
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);
    return weekStart;
  }, [weekOffset, weekStartDay]);

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
              onClick={() => navigate('/plan')}
              className="p-3 md:p-2 hover:bg-muted rounded-md touch-manipulation"
              aria-label="Open planning board"
              title="Plan next week"
            >
              <CalendarPlus className="h-5 w-5" />
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
      queryClient.invalidateQueries({ queryKey: ['groceries'] });
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error('Failed to update dinner');
      console.error('Error updating entry:', error);
    },
  });

  function handleScaleChange(newScale: 1 | 2 | 4) {
    updateMutation.mutate({
      type: entry.type,
      mainDishId: entry.mainDish?.id ?? null,
      sideDishIds: entry.sideDishes.map((d) => d.id),
      scale: newScale,
    });
  }

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
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{entry.mainDish.name}</div>
                  {entry.scale > 1 && (
                    <span className="shrink-0 text-xs font-semibold text-primary tabular-nums">
                      {entry.scale}&times;
                    </span>
                  )}
                </div>
                {entry.sideDishes.length > 0 && (
                  <div className="text-sm text-muted-foreground truncate">
                    with {entry.sideDishes.map((d) => d.name).join(', ')}
                  </div>
                )}
                <div
                  className="flex items-center gap-1 mt-1"
                  role="group"
                  aria-label="Serving scale"
                >
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleScaleChange(s)}
                      disabled={updateMutation.isPending}
                      className={cn(
                        'px-1.5 py-0.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                        entry.scale === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input hover:bg-muted text-muted-foreground'
                      )}
                      aria-pressed={entry.scale === s}
                    >
                      {s}&times;
                    </button>
                  ))}
                </div>
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
              <span className="text-green-600 dark:text-green-400" aria-label="Completed">
                <Check className="h-5 w-5" aria-hidden="true" />
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
