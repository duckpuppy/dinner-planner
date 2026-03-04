import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  menus,
  preparations,
  ratings,
  prepTasks,
  users,
  type DinnerEntry,
  type UpdateEntryData,
} from '@/lib/api';
import { PrepTaskList } from '@/components/PrepTaskList';
import { PreparationPhotos } from '@/components/PreparationPhotos';
import {
  Calendar,
  ChefHat,
  Check,
  Clock,
  UtensilsCrossed,
  Star,
  CalendarX,
  ClipboardList,
  SkipForward,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn, localDateStr } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { StarRating } from '@/components/StarRating';
import { SkeletonCard, Skeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTomorrowDateStr(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateStr(tomorrow);
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  assembled: 'Home Cooked',
  fend_for_self: 'Fend for Yourself',
  dining_out: 'Dining Out',
  custom: 'Custom',
  leftovers: 'Leftovers',
};

export function TodayPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['today'],
    queryFn: () => menus.getToday(),
  });

  if (isLoading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-8 w-48" />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <ErrorState
          title="Failed to load today's dinner"
          message="We couldn't load your dinner information. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const entry = data?.entry;

  if (!entry) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Today's Dinner</h1>
        </div>
        <EmptyState
          icon={CalendarX}
          title="No dinner planned"
          description="No dinner has been planned for today. Check the week view to plan ahead."
        />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{DAY_NAMES[entry.dayOfWeek]}'s Dinner</h1>
      </div>

      <TodayCard entry={entry} />

      <TomorrowPrepSection />
    </div>
  );
}

function TomorrowPrepSection() {
  const tomorrowStr = getTomorrowDateStr();

  const { data } = useQuery({
    queryKey: ['week', tomorrowStr],
    queryFn: () => menus.getWeek(tomorrowStr),
  });

  const tomorrowEntry = data?.menu.entries.find((e) => e.date === tomorrowStr);

  const { data: tasksData } = useQuery({
    queryKey: ['prepTasks', tomorrowEntry?.id],
    queryFn: () => prepTasks.list(tomorrowEntry!.id),
    enabled: !!tomorrowEntry,
  });

  if (!tomorrowEntry || !tasksData?.prepTasks?.length) return null;

  const tomorrowDayName = DAY_NAMES[tomorrowEntry.dayOfWeek];

  return (
    <div className="mt-6 border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 flex items-center gap-2 border-b">
        <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-balance">Prep for {tomorrowDayName}</h2>
        {tomorrowEntry.mainDish && (
          <span className="text-sm text-muted-foreground truncate">
            — {tomorrowEntry.mainDish.name}
          </span>
        )}
      </div>
      <div className="p-4">
        <PrepTaskList entryId={tomorrowEntry.id} />
      </div>
    </div>
  );
}

function TodayCard({ entry }: { entry: DinnerEntry }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [showPrepForm, setShowPrepForm] = useState(false);
  const [selectedPreparerIds, setSelectedPreparerIds] = useState<string[]>([]);
  const user = useAuthStore((s) => s.user);

  const skipMutation = useMutation({
    mutationFn: (skipped: boolean) => menus.skipEntry(entry.id, skipped),
    onSuccess: (_data, skipped) => {
      toast.success(skipped ? 'Marked as skipped' : 'Unskipped');
      queryClient.invalidateQueries({ queryKey: ['today'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const scaleMutation = useMutation({
    mutationFn: (data: UpdateEntryData) => menus.updateEntry(entry.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] });
      queryClient.invalidateQueries({ queryKey: ['week'] });
      queryClient.invalidateQueries({ queryKey: ['groceries'] });
    },
    onError: () => toast.error('Failed to update serving scale'),
  });

  function handleScaleChange(newScale: 1 | 2 | 4) {
    scaleMutation.mutate({
      type: entry.type,
      mainDishId: entry.mainDish?.id ?? null,
      sideDishIds: entry.sideDishes.map((d) => d.id),
      scale: newScale,
    });
  }

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => users.list(),
  });
  const usersList = usersData?.users ?? [];

  const togglePreparer = (id: string) => {
    setSelectedPreparerIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]
    );
  };

  const logPrepMutation = useMutation({
    mutationFn: (data: {
      dinnerEntryId: string;
      dishId: string;
      preparerIds: string[];
      notes?: string | null;
    }) => preparations.create(data),
    onSuccess: () => {
      toast.success('Preparation logged successfully');
      queryClient.invalidateQueries({ queryKey: ['today'] });
      setShowPrepForm(false);
      setNotes('');
      setSelectedPreparerIds([]);
    },
    onError: (error) => {
      toast.error('Failed to log preparation');
      console.error('Error logging preparation:', error);
    },
  });

  const handleLogPrep = () => {
    if (!entry.mainDish) return;
    logPrepMutation.mutate({
      dinnerEntryId: entry.id,
      dishId: entry.mainDish.id,
      preparerIds: selectedPreparerIds,
      notes: notes || null,
    });
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      {/* Status banner */}
      <div
        className={cn(
          'px-4 py-2 text-sm font-medium flex items-center gap-2',
          entry.completed
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : entry.skipped
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-muted text-muted-foreground'
        )}
      >
        {entry.completed ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Completed
          </>
        ) : entry.skipped ? (
          <>
            <SkipForward className="h-4 w-4" aria-hidden="true" />
            Skipped
          </>
        ) : (
          <>
            <Clock className="h-4 w-4" aria-hidden="true" />
            Not yet prepared
          </>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Entry type */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
          {ENTRY_TYPE_LABELS[entry.type]}
        </div>

        {/* Main dish */}
        {entry.type === 'assembled' && entry.mainDish && (
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{entry.mainDish.name}</h2>
              {entry.scale > 1 && (
                <span
                  className="text-sm font-semibold text-primary tabular-nums"
                  aria-label={`Serving scale: ${entry.scale}×`}
                >
                  {entry.scale}&times;
                </span>
              )}
            </div>
            {entry.sideDishes.length > 0 && (
              <p className="text-muted-foreground mt-1">
                with {entry.sideDishes.map((d) => d.name).join(', ')}
              </p>
            )}
            <div className="flex items-center gap-1 mt-2" role="group" aria-label="Serving scale">
              {([1, 2, 4] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScaleChange(s)}
                  disabled={scaleMutation.isPending}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
          </div>
        )}

        {/* Custom text */}
        {entry.type === 'custom' && entry.customText && (
          <p className="text-lg">{entry.customText}</p>
        )}

        {/* Fend for self / Dining out */}
        {entry.type === 'fend_for_self' && (
          <p className="text-lg text-muted-foreground">Everyone on their own tonight!</p>
        )}

        {entry.type === 'dining_out' && (
          <div>
            <p className="text-lg text-muted-foreground">
              {entry.restaurantName || entry.customText
                ? `Dining Out: ${entry.restaurantName || entry.customText}`
                : 'Dining Out'}
            </p>
            {entry.restaurantNotes && (
              <p className="text-sm text-muted-foreground">{entry.restaurantNotes}</p>
            )}
          </div>
        )}

        {entry.type === 'leftovers' && (
          <p className="text-lg text-muted-foreground">
            {entry.sourceEntryDishName
              ? `Leftovers from ${entry.sourceEntryDishName}`
              : 'Leftovers'}
          </p>
        )}

        {/* No dish selected */}
        {entry.type === 'assembled' && !entry.mainDish && (
          <p className="text-muted-foreground">No dish selected yet</p>
        )}

        {/* Preparations with Ratings */}
        {entry.preparations.length > 0 && (
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-3">Prepared by</h3>
            <div className="space-y-4">
              {entry.preparations.map((prep) => (
                <PreparationWithRating
                  key={prep.id}
                  preparation={prep}
                  currentUserId={user?.id ?? ''}
                />
              ))}
            </div>
          </div>
        )}

        {/* Unskip link */}
        {entry.skipped && !entry.completed && (
          <div className="pt-2">
            <button
              onClick={() => skipMutation.mutate(false)}
              disabled={skipMutation.isPending}
              className="py-1 min-h-[44px] text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Unskip
            </button>
          </div>
        )}

        {/* Log preparation */}
        {!entry.completed && !entry.skipped && entry.type === 'assembled' && entry.mainDish && (
          <div className="pt-4 border-t">
            {showPrepForm ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-2">Who cooked?</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Select preparers">
                    {usersList.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => togglePreparer(u.id)}
                        aria-pressed={selectedPreparerIds.includes(u.id)}
                        className={cn(
                          'px-3 py-2 rounded-full text-sm font-medium transition-colors',
                          selectedPreparerIds.includes(u.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {u.displayName}
                      </button>
                    ))}
                  </div>
                  {selectedPreparerIds.length === 0 && (
                    <p className="text-sm text-destructive mt-1">
                      At least one preparer is required.
                    </p>
                  )}
                </div>
                <label htmlFor="prep-notes" className="sr-only">
                  Preparation notes
                </label>
                <textarea
                  id="prep-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes (optional)"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm
                             focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleLogPrep}
                    disabled={logPrepMutation.isPending || selectedPreparerIds.length === 0}
                    className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                               text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {logPrepMutation.isPending ? 'Logging...' : 'Log Preparation'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPrepForm(false);
                      setSelectedPreparerIds([]);
                      setNotes('');
                    }}
                    className="py-2 px-4 border rounded-md text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowPrepForm(true)}
                className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md
                           font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                <ChefHat className="h-4 w-4" aria-hidden="true" />I Made This!
              </button>
            )}
          </div>
        )}

        {/* Skip button */}
        {!entry.completed && !entry.skipped && (
          <div className="pt-2">
            <button
              onClick={() => skipMutation.mutate(true)}
              disabled={skipMutation.isPending}
              className="flex items-center gap-1.5 py-1 min-h-[44px] text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Skip this dinner entry"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface PreparationWithRatingProps {
  preparation: DinnerEntry['preparations'][0];
  currentUserId: string;
}

function PreparationWithRating({ preparation, currentUserId }: PreparationWithRatingProps) {
  const queryClient = useQueryClient();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [showRatingForm, setShowRatingForm] = useState(false);

  // Fetch ratings for this preparation
  const { data: ratingsData } = useQuery({
    queryKey: ['ratings', preparation.id],
    queryFn: () => ratings.getForPreparation(preparation.id),
  });

  const ratingsList = ratingsData?.ratings ?? [];
  const myRating = ratingsList.find((r) => r.userId === currentUserId);

  const createRatingMutation = useMutation({
    mutationFn: () => ratings.create(preparation.id, { stars, note: note || undefined }),
    onSuccess: () => {
      toast.success('Rating added successfully');
      queryClient.invalidateQueries({ queryKey: ['ratings', preparation.id] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
      setShowRatingForm(false);
      setStars(0);
      setNote('');
    },
    onError: (error) => {
      toast.error('Failed to add rating');
      console.error('Error creating rating:', error);
    },
  });

  const deleteRatingMutation = useMutation({
    mutationFn: (ratingId: string) => ratings.delete(ratingId),
    onSuccess: () => {
      toast.success('Rating deleted');
      queryClient.invalidateQueries({ queryKey: ['ratings', preparation.id] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
    },
    onError: (error) => {
      toast.error('Failed to delete rating');
      console.error('Error deleting rating:', error);
    },
  });

  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-start gap-2 text-sm">
        <ChefHat className="h-4 w-4 text-muted-foreground mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <span className="font-medium">
            {preparation.preparers.map((p) => p.name).join(' & ')}
          </span>
          {preparation.notes && (
            <p className="text-muted-foreground text-sm">{preparation.notes}</p>
          )}

          <PreparationPhotos preparationId={preparation.id} />

          {/* Show existing ratings */}
          {ratingsList.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {ratingsList.map((rating) => (
                <div key={rating.id} className="flex items-center gap-2 text-sm">
                  <StarRating value={rating.stars} size="sm" readonly />
                  <span className="text-muted-foreground">{rating.userName}</span>
                  {rating.note && <span className="text-muted-foreground/70">- {rating.note}</span>}
                  {rating.userId === currentUserId && (
                    <button
                      onClick={() => deleteRatingMutation.mutate(rating.id)}
                      className="ml-auto text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rating form for user who hasn't rated */}
          {!myRating && (
            <div className="mt-3">
              {showRatingForm ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Your rating:</span>
                    <StarRating value={stars} onChange={setStars} size="md" />
                  </div>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    aria-label="Rating note"
                    className="w-full px-2 py-1 text-sm border rounded bg-background"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => createRatingMutation.mutate()}
                      disabled={stars === 0 || createRatingMutation.isPending}
                      className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createRatingMutation.isPending ? 'Saving...' : 'Submit'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRatingForm(false);
                        setStars(0);
                        setNote('');
                      }}
                      className="px-3 py-1 text-sm border rounded hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowRatingForm(true)}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                >
                  <Star className="h-4 w-4" aria-hidden="true" />
                  Rate this meal
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
