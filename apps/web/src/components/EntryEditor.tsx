import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Sparkles, CalendarOff } from 'lucide-react';
import { menus, dishes } from '@/lib/api';
import type { DinnerEntry, UpdateEntryData, SuggestedDish } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SuggestionModal } from '@/components/SuggestionModal';

const DAY_NAMES_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface EntryEditorProps {
  entry: DinnerEntry;
  onSave: (data: UpdateEntryData) => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function EntryEditor({ entry, onSave, onCancel, isSaving }: EntryEditorProps) {
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
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-muted rounded"
          aria-label="Cancel editing"
        >
          <X className="h-4 w-4" aria-hidden="true" />
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
              <label htmlFor="main-dish-select" className="text-sm font-medium">
                Main Dish
              </label>
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
              id="main-dish-select"
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
