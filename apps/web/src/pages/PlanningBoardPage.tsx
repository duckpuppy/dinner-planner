import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { menus } from '@/lib/api';
import type { DinnerEntry, UpdateEntryData } from '@/lib/api';
import { localDateStr } from '@/lib/utils';
import { PlanDayCard, isEntryPlanned } from '@/components/PlanDayCard';
import { SuggestionModal } from '@/components/SuggestionModal';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

function getNextWeekDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return localDateStr(d);
}

function formatWeekRange(entries: DinnerEntry[]): string {
  if (!entries.length) return 'Next Week';
  const first = new Date(entries[0].date + 'T00:00:00');
  const last = new Date(entries[entries.length - 1].date + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${first.toLocaleDateString('en-US', opts)} – ${last.toLocaleDateString('en-US', opts)}`;
}

export function PlanningBoardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const nextWeekDate = useMemo(() => getNextWeekDate(), []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['week', nextWeekDate],
    queryFn: () => menus.getWeek(nextWeekDate),
  });

  // Local optimistic entries for drag-swap
  const [localEntries, setLocalEntries] = useState<DinnerEntry[] | null>(null);
  const entries: DinnerEntry[] = useMemo(
    () => localEntries ?? data?.menu.entries ?? [],
    [localEntries, data?.menu.entries]
  );

  // Which entry is actively being dragged
  const [activeId, setActiveId] = useState<string | null>(null);

  // Suggestion modal state
  const [pickingEntryId, setPickingEntryId] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEntryData }) =>
      menus.updateEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week', nextWeekDate] });
    },
    onError: () => {
      // Revert optimistic update
      setLocalEntries(null);
      toast.error('Failed to swap meals. Changes reverted.');
    },
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const sourceEntry = entries.find((e) => e.id === active.id);
      const targetEntry = entries.find((e) => e.id === over.id);
      if (!sourceEntry || !targetEntry) return;

      // Optimistic swap
      const swapped = entries.map((e) => {
        if (e.id === sourceEntry.id) {
          return {
            ...e,
            type: targetEntry.type,
            mainDish: targetEntry.mainDish,
            sideDishes: targetEntry.sideDishes,
            customText: targetEntry.customText,
            restaurantName: targetEntry.restaurantName,
            restaurantNotes: targetEntry.restaurantNotes,
            sourceEntryId: targetEntry.sourceEntryId,
            sourceEntryDishName: targetEntry.sourceEntryDishName,
          };
        }
        if (e.id === targetEntry.id) {
          return {
            ...e,
            type: sourceEntry.type,
            mainDish: sourceEntry.mainDish,
            sideDishes: sourceEntry.sideDishes,
            customText: sourceEntry.customText,
            restaurantName: sourceEntry.restaurantName,
            restaurantNotes: sourceEntry.restaurantNotes,
            sourceEntryId: sourceEntry.sourceEntryId,
            sourceEntryDishName: sourceEntry.sourceEntryDishName,
          };
        }
        return e;
      });
      setLocalEntries(swapped);

      // PATCH both entries
      const sourceUpdate: UpdateEntryData = {
        type: targetEntry.type,
        mainDishId: targetEntry.mainDish?.id ?? null,
        sideDishIds: targetEntry.sideDishes.map((d) => d.id),
        customText: targetEntry.customText,
        restaurantName: targetEntry.restaurantName,
        restaurantNotes: targetEntry.restaurantNotes,
        sourceEntryId: targetEntry.sourceEntryId,
      };
      const targetUpdate: UpdateEntryData = {
        type: sourceEntry.type,
        mainDishId: sourceEntry.mainDish?.id ?? null,
        sideDishIds: sourceEntry.sideDishes.map((d) => d.id),
        customText: sourceEntry.customText,
        restaurantName: sourceEntry.restaurantName,
        restaurantNotes: sourceEntry.restaurantNotes,
        sourceEntryId: sourceEntry.sourceEntryId,
      };

      Promise.all([
        updateMutation.mutateAsync({ id: sourceEntry.id, data: sourceUpdate }),
        updateMutation.mutateAsync({ id: targetEntry.id, data: targetUpdate }),
      ])
        .then(() => {
          setLocalEntries(null);
        })
        .catch(() => {
          // onError handles revert
        });
    },
    [entries, updateMutation]
  );

  const handleClear = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      updateMutation.mutate({
        id: entryId,
        data: {
          type: 'assembled',
          mainDishId: null,
          sideDishIds: [],
          customText: null,
          restaurantName: null,
          restaurantNotes: null,
          sourceEntryId: null,
        },
      });
    },
    [entries, updateMutation]
  );

  const plannedCount = entries.filter(isEntryPlanned).length;
  const totalCount = entries.length;

  const pickingEntry = pickingEntryId ? entries.find((e) => e.id === pickingEntryId) : null;
  const availableTags: string[] = [];

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-balance">Plan Next Week</h1>
          {!isLoading && !isError && (
            <p className="text-sm text-muted-foreground">{formatWeekRange(entries)}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Progress chip */}
          {!isLoading && !isError && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tabular-nums bg-muted text-muted-foreground"
              aria-label={`${plannedCount} of ${totalCount} days planned`}
            >
              {plannedCount === totalCount && (
                <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
              )}
              {plannedCount} / {totalCount} planned
            </span>
          )}

          {/* Done button */}
          <button
            type="button"
            onClick={() => navigate('/week')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <SkeletonList count={7} />
      ) : isError ? (
        <ErrorState
          message="Failed to load next week's menu. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Mobile: vertical stack; md+: 7-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 overflow-x-auto">
            {entries.map((entry) => (
              <PlanDayCard
                key={entry.id}
                entry={entry}
                onPick={() => setPickingEntryId(entry.id)}
                onClear={() => handleClear(entry.id)}
                isDragging={activeId === entry.id}
                isOver={false}
              />
            ))}
          </div>
        </DndContext>
      )}

      {/* Suggestion modal for picking a meal */}
      {pickingEntry && (
        <SuggestionModal
          open={true}
          availableTags={availableTags}
          onSelect={(dish) => {
            if (!pickingEntryId) return;
            updateMutation.mutate({
              id: pickingEntryId,
              data: {
                type: 'assembled',
                mainDishId: dish.id,
                sideDishIds: [],
                customText: null,
                restaurantName: null,
                restaurantNotes: null,
                sourceEntryId: null,
              },
            });
            setPickingEntryId(null);
          }}
          onClose={() => setPickingEntryId(null)}
        />
      )}
    </div>
  );
}
