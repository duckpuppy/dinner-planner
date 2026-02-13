import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menus, preparations, ratings, type DinnerEntry } from '@/lib/api';
import { Calendar, ChefHat, Check, Clock, UtensilsCrossed, Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { StarRating } from '@/components/StarRating';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  assembled: 'Home Cooked',
  fend_for_self: 'Fend for Yourself',
  dining_out: 'Dining Out',
  custom: 'Custom',
};

export function TodayPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['today'],
    queryFn: () => menus.getToday(),
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          Failed to load today's dinner
        </div>
      </div>
    );
  }

  const entry = data?.entry;

  if (!entry) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Today's Dinner</h1>
        <p className="text-muted-foreground">No dinner planned for today</p>
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
    </div>
  );
}

function TodayCard({ entry }: { entry: DinnerEntry }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [showPrepForm, setShowPrepForm] = useState(false);
  const user = useAuthStore((s) => s.user);

  const logPrepMutation = useMutation({
    mutationFn: (data: { dinnerEntryId: string; dishId: string; notes?: string | null }) =>
      preparations.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] });
      setShowPrepForm(false);
      setNotes('');
    },
  });

  const handleLogPrep = () => {
    if (!entry.mainDish) return;
    logPrepMutation.mutate({
      dinnerEntryId: entry.id,
      dishId: entry.mainDish.id,
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
            : 'bg-muted text-muted-foreground'
        )}
      >
        {entry.completed ? (
          <>
            <Check className="h-4 w-4" />
            Completed
          </>
        ) : (
          <>
            <Clock className="h-4 w-4" />
            Not yet prepared
          </>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Entry type */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UtensilsCrossed className="h-4 w-4" />
          {ENTRY_TYPE_LABELS[entry.type]}
        </div>

        {/* Main dish */}
        {entry.type === 'assembled' && entry.mainDish && (
          <div>
            <h2 className="text-xl font-semibold">{entry.mainDish.name}</h2>
            {entry.sideDishes.length > 0 && (
              <p className="text-muted-foreground mt-1">
                with {entry.sideDishes.map((d) => d.name).join(', ')}
              </p>
            )}
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
          <p className="text-lg text-muted-foreground">
            {entry.customText || 'Eating out tonight!'}
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

        {/* Log preparation */}
        {!entry.completed && entry.type === 'assembled' && entry.mainDish && (
          <div className="pt-4 border-t">
            {showPrepForm ? (
              <div className="space-y-3">
                <textarea
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
                    disabled={logPrepMutation.isPending}
                    className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md
                               text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {logPrepMutation.isPending ? 'Logging...' : 'Log Preparation'}
                  </button>
                  <button
                    onClick={() => setShowPrepForm(false)}
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
                <ChefHat className="h-4 w-4" />I Made This!
              </button>
            )}
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
      queryClient.invalidateQueries({ queryKey: ['ratings', preparation.id] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
      setShowRatingForm(false);
      setStars(0);
      setNote('');
    },
  });

  const deleteRatingMutation = useMutation({
    mutationFn: (ratingId: string) => ratings.delete(ratingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ratings', preparation.id] });
      queryClient.invalidateQueries({ queryKey: ['today'] });
    },
  });

  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-start gap-2 text-sm">
        <ChefHat className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <span className="font-medium">{preparation.preparedByName}</span>
          {preparation.notes && (
            <p className="text-muted-foreground text-sm">{preparation.notes}</p>
          )}

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
                  <Star className="h-4 w-4" />
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
