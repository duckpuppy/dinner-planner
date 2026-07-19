import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Edit2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DinnerEntry } from '@/lib/api';

export const DAY_NAMES_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface WeekEntryRef {
  id: string;
  dayOfWeek: number;
  date: string;
  type: DinnerEntry['type'];
}

export interface PlanDayCardProps {
  entry: DinnerEntry;
  weekEntries: WeekEntryRef[];
  onEdit: () => void;
  onClear: () => void;
  onMoveSide: (dishId: string, sourceEntryId: string, targetEntryId: string) => void;
  isDragging: boolean;
  isOver: boolean;
}

function getEntryLabel(entry: DinnerEntry): string | null {
  if (entry.type === 'assembled') {
    return entry.mainDish?.name ?? null;
  }
  if (entry.type === 'fend_for_self') return 'Fend for Yourself';
  if (entry.type === 'dining_out') {
    return entry.restaurantName || entry.customText || 'Dining Out';
  }
  if (entry.type === 'leftovers') {
    return entry.sourceEntryDishName ? `Leftovers: ${entry.sourceEntryDishName}` : 'Leftovers';
  }
  if (entry.type === 'custom') return entry.customText || 'Custom';
  return null;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function isEntryPlanned(entry: DinnerEntry): boolean {
  return entry.mainDish !== null || entry.type !== 'assembled';
}

interface SideDishItemProps {
  dish: { id: string; name: string };
  entry: DinnerEntry;
  weekEntries: WeekEntryRef[];
  onMoveSide: (dishId: string, sourceEntryId: string, targetEntryId: string) => void;
}

function SideDishItem({ dish, entry, weekEntries, onMoveSide }: SideDishItemProps) {
  // Only entries of type 'assembled' render/persist side dishes today, so
  // limit move targets to those — moving onto another entry type would
  // silently vanish from the UI even though the data would still round-trip.
  const otherDays = weekEntries.filter((e) => e.id !== entry.id && e.type === 'assembled');

  return (
    <li className="flex items-center justify-between gap-1">
      <span className="text-xs text-muted-foreground truncate">{dish.name}</span>
      {otherDays.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const targetId = e.target.value;
            if (targetId) onMoveSide(dish.id, entry.id, targetId);
          }}
          aria-label={`Move ${dish.name} to a different day`}
          className="shrink-0 max-w-[92px] text-[10px] bg-transparent border border-border/60 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="" disabled>
            Move…
          </option>
          {otherDays.map((d) => (
            <option key={d.id} value={d.id}>
              {DAY_NAMES_FULL[d.dayOfWeek].slice(0, 3)} {formatShortDate(d.date)}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

export function PlanDayCard({
  entry,
  weekEntries,
  onEdit,
  onClear,
  onMoveSide,
  isDragging,
  isOver,
}: PlanDayCardProps) {
  const planned = isEntryPlanned(entry);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
  } = useDraggable({
    id: entry.id,
    disabled: !planned,
  });

  const { setNodeRef: setDropRef, isOver: dndIsOver } = useDroppable({
    id: entry.id,
  });

  const label = getEntryLabel(entry);
  const date = new Date(entry.date + 'T00:00:00');
  const dayName = DAY_NAMES_FULL[entry.dayOfWeek];
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Side dishes only render/persist for 'assembled' entries. They can exist
  // even when no main dish has been picked yet (an "empty" day that already
  // has a moved-in side), so this is intentionally independent of `planned`.
  const hasSideDishes = entry.type === 'assembled' && entry.sideDishes.length > 0;

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50, position: 'relative' as const }
    : undefined;

  const combinedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const highlighted = isOver || dndIsOver;

  return (
    <div
      ref={combinedRef}
      style={style}
      className={cn(
        'relative flex flex-col rounded-xl border bg-card p-3 min-h-[120px] select-none transition-colors overflow-hidden',
        highlighted ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'border-border',
        isDragging && 'opacity-50',
        !planned && 'border-dashed'
      )}
      aria-label={`${dayName} ${dateLabel}: ${planned ? (label ?? 'planned') : 'empty'}`}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {dayName.slice(0, 3)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{dateLabel}</span>
        </div>

        {planned && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Edit meal for ${dayName}`}
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Clear meal for ${dayName}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        {planned && label ? (
          <div className="flex items-start gap-2">
            {/* Drag handle */}
            <button
              type="button"
              className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0 touch-manipulation"
              aria-label={`Drag ${dayName} to swap meals`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{label}</p>
              {(entry.type === 'custom' ||
                (entry.type === 'dining_out' && entry.restaurantName)) && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide font-medium">
                  {entry.type.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors text-sm',
              hasSideDishes ? 'w-full py-1.5 text-xs' : 'w-full h-full min-h-[48px]'
            )}
            aria-label={`Add meal for ${dayName}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add meal
          </button>
        )}

        {hasSideDishes && (
          <ul className={cn('space-y-1', planned && label && 'pl-6')}>
            {entry.sideDishes.map((dish) => (
              <SideDishItem
                key={dish.id}
                dish={dish}
                entry={entry}
                weekEntries={weekEntries}
                onMoveSide={onMoveSide}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
