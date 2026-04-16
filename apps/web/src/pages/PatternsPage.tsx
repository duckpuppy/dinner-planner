import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patterns, dishes, type Pattern } from '@/lib/api';
import { Plus, Trash2, Edit2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ENTRY_TYPES = [
  { value: 'assembled', label: 'Home Cooked' },
  { value: 'fend_for_self', label: 'Fend' },
  { value: 'dining_out', label: 'Dining Out' },
  { value: 'custom', label: 'Custom' },
] as const;

type EntryType = (typeof ENTRY_TYPES)[number]['value'];

interface PatternFormState {
  label: string;
  dayOfWeek: number;
  type: EntryType;
  mainDishId: string;
  sideDishIds: string[];
  customText: string;
}

const defaultForm = (): PatternFormState => ({
  label: '',
  dayOfWeek: 1,
  type: 'assembled',
  mainDishId: '',
  sideDishIds: [],
  customText: '',
});

function patternToForm(p: Pattern): PatternFormState {
  return {
    label: p.label,
    dayOfWeek: p.dayOfWeek,
    type: p.type,
    mainDishId: p.mainDishId || '',
    sideDishIds: p.sideDishIds,
    customText: p.customText || '',
  };
}

interface PatternFormProps {
  initial?: Pattern;
  onClose: () => void;
}

function PatternForm({ initial, onClose }: PatternFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PatternFormState>(
    initial ? patternToForm(initial) : defaultForm()
  );

  const { data: dishesData } = useQuery({
    queryKey: ['dishes', { archived: 'false' }],
    queryFn: () => dishes.list({ archived: 'false', limit: '100' }),
  });

  const allDishes = dishesData?.dishes || [];
  const mainDishes = allDishes.filter((d) => d.type === 'main' || d.type === 'both');
  const sideDishes = allDishes.filter((d) => d.type === 'side' || d.type === 'both');

  const createMutation = useMutation({
    mutationFn: (data: PatternFormState) =>
      patterns.create({
        label: data.label,
        dayOfWeek: data.dayOfWeek,
        type: data.type,
        mainDishId: data.type === 'assembled' ? data.mainDishId || null : null,
        sideDishIds: data.type === 'assembled' ? data.sideDishIds : [],
        customText: ['dining_out', 'custom'].includes(data.type) ? data.customText || null : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      toast.success('Pattern created');
      onClose();
    },
    onError: () => toast.error('Failed to create pattern'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: PatternFormState) =>
      patterns.update(initial!.id, {
        label: data.label,
        dayOfWeek: data.dayOfWeek,
        type: data.type,
        mainDishId: data.type === 'assembled' ? data.mainDishId || null : null,
        sideDishIds: data.type === 'assembled' ? data.sideDishIds : [],
        customText: ['dining_out', 'custom'].includes(data.type) ? data.customText || null : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      toast.success('Pattern updated');
      onClose();
    },
    onError: () => toast.error('Failed to update pattern'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (initial) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleSideDish = (id: string) => {
    setForm((f) => ({
      ...f,
      sideDishIds: f.sideDishIds.includes(id)
        ? f.sideDishIds.filter((d) => d !== id)
        : [...f.sideDishIds, id],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-card rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial ? 'Edit Pattern' : 'New Pattern'}</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Label */}
        <div>
          <label className="block text-sm font-medium mb-1">Label</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Taco Tuesday"
            className="w-full px-3 py-2 border rounded-md bg-background"
            maxLength={100}
          />
        </div>

        {/* Day of week */}
        <div>
          <label className="block text-sm font-medium mb-1">Day of Week</label>
          <select
            value={form.dayOfWeek}
            onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {ENTRY_TYPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                className={cn(
                  'py-2 px-3 rounded-md text-sm font-medium border',
                  form.type === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-muted border-input'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dish selector for assembled */}
        {form.type === 'assembled' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Main Dish (optional)</label>
              <select
                value={form.mainDishId}
                onChange={(e) => setForm((f) => ({ ...f, mainDishId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="">Any / No preference</option>
                {mainDishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {sideDishes.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">Side Dishes (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {sideDishes.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleSideDish(d.id)}
                      className={cn(
                        'py-1 px-3 rounded-full text-sm border',
                        form.sideDishIds.includes(d.id)
                          ? 'bg-secondary text-secondary-foreground border-secondary'
                          : 'hover:bg-muted border-input'
                      )}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom text */}
        {['dining_out', 'custom'].includes(form.type) && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {form.type === 'dining_out'
                ? 'Restaurant / Notes (optional)'
                : 'Description (optional)'}
            </label>
            <input
              type="text"
              value={form.customText}
              onChange={(e) => setForm((f) => ({ ...f, customText: e.target.value }))}
              placeholder={form.type === 'dining_out' ? 'Restaurant name...' : 'Description...'}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium
                       hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Pattern'}
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

export function PatternsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patterns'],
    queryFn: () => patterns.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patterns.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      toast.success('Pattern deleted');
    },
    onError: () => toast.error('Failed to delete pattern'),
  });

  const patternList = data?.patterns || [];

  // Group by day of week
  const byDay = DAY_NAMES.map((name, i) => ({
    day: i,
    name,
    patterns: patternList.filter((p) => p.dayOfWeek === i),
  })).filter((g) => g.patterns.length > 0);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Recurring Patterns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Templates applied to untouched days via the ⚡ button on the week view
          </p>
        </div>
        <button
          onClick={() => {
            setEditingPattern(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground
                     rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Pattern
        </button>
      </div>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : isError ? (
        <ErrorState
          message="Failed to load patterns."
          error={error as Error}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['patterns'] })}
        />
      ) : patternList.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No patterns yet"
          description="Create recurring meal patterns to quickly fill in your weekly menu."
        />
      ) : (
        <div className="space-y-6">
          {byDay.map(({ name, patterns: dayPatterns }) => (
            <div key={name}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {name}
              </h2>
              <div className="space-y-2">
                {dayPatterns.map((pattern) => (
                  <div
                    key={pattern.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{pattern.label}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {pattern.type === 'assembled' ? (
                          <>
                            {pattern.mainDish?.name || 'Any dish'}
                            {pattern.sideDishes.length > 0 &&
                              ` + ${pattern.sideDishes.map((d) => d.name).join(', ')}`}
                          </>
                        ) : pattern.type === 'fend_for_self' ? (
                          'Fend for Yourself'
                        ) : pattern.type === 'dining_out' ? (
                          pattern.customText ? (
                            `Dining Out: ${pattern.customText}`
                          ) : (
                            'Dining Out'
                          )
                        ) : (
                          pattern.customText || 'Custom'
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingPattern(pattern);
                          setShowForm(true);
                        }}
                        className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                        aria-label="Edit pattern"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete pattern "${pattern.label}"?`)) {
                            deleteMutation.mutate(pattern.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label="Delete pattern"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <PatternForm
          initial={editingPattern ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditingPattern(null);
          }}
        />
      )}
    </div>
  );
}
