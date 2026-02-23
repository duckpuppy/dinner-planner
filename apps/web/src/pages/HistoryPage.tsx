import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { history, dishNotes as dishNotesApi, type HistoryEntry } from '@/lib/api';
import { PreparationPhotos } from '@/components/PreparationPhotos';
import {
  Calendar,
  Search,
  ChefHat,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Star,
  BookmarkPlus,
} from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { SwipeableListItem } from '@/components/mobile/SwipeableListItem';
import { useSwipeActions } from '@/hooks/useSwipeActions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  assembled: 'Home Cooked',
  fend_for_self: 'Fend for Yourself',
  dining_out: 'Dining Out',
  custom: 'Custom',
};

const PAGE_SIZE = 20;

export function HistoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [deleteEntry, setDeleteEntry] = useState<HistoryEntry | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['history', { search, startDate, endDate, page }],
    queryFn: () =>
      history.list({
        search: search || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { activeItemId, openSwipe, closeSwipe } = useSwipeActions();

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => history.delete(entryId),
    onSuccess: () => {
      toast.success('History entry deleted');
      queryClient.invalidateQueries({ queryKey: ['history'] });
      closeSwipe();
      setDeleteEntry(null);
    },
    onError: (error) => {
      toast.error('Failed to delete entry');
      console.error('Error deleting history entry:', error);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
  };

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

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
      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Meal History</h1>
        </div>

        {/* Search and filters */}
        <form onSubmit={handleSearch} className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {(search || startDate || endDate) && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        </form>

        {/* Loading */}
        {isLoading && <SkeletonList count={5} />}

        {/* Error */}
        {error && (
          <ErrorState
            message="Failed to load history. Please try again."
            error={error as Error}
            onRetry={() => refetch()}
          />
        )}

        {/* Empty state */}
        {!isLoading && !error && entries.length === 0 && (
          <EmptyState
            icon={Calendar}
            title="No meal history found"
            description={search || startDate || endDate ? 'Try adjusting your filters' : undefined}
          />
        )}

        {/* Timeline */}
        {!isLoading && entries.length > 0 && (
          <div className="space-y-4">
            {entries.map((entry) => (
              <SwipeableListItem
                key={entry.id}
                itemId={entry.id}
                activeItemId={activeItemId}
                onSwipeStart={openSwipe}
                onSwipeEnd={closeSwipe}
                actions={[
                  {
                    label: 'Delete',
                    icon: Trash2,
                    color: 'destructive',
                    onAction: () => setDeleteEntry(entry),
                  },
                  {
                    label: 'Rate',
                    icon: Star,
                    color: 'primary',
                    onAction: () => {
                      // TODO: Implement rating modal
                      toast.info('Rating feature coming soon!');
                    },
                  },
                ]}
              >
                <HistoryCard entry={entry} />
              </SwipeableListItem>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-3 md:p-2 rounded-lg border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-3 md:p-2 rounded-lg border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={deleteEntry !== null}
          title="Delete History Entry"
          description={`Are you sure you want to delete this meal from ${deleteEntry ? new Date(deleteEntry.date).toLocaleDateString() : ''}? This will remove all preparations and ratings for this entry. This action cannot be undone.`}
          confirmText="Delete"
          variant="destructive"
          onConfirm={() => {
            if (deleteEntry) {
              deleteMutation.mutate(deleteEntry.id);
            }
          }}
          onCancel={() => setDeleteEntry(null)}
          loading={deleteMutation.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const queryClient = useQueryClient();
  const date = new Date(entry.date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const mainDishId = entry.mainDish?.id ?? null;

  const saveAsNoteMutation = useMutation({
    mutationFn: ({ dishId, note }: { dishId: string; note: string }) =>
      dishNotesApi.create(dishId, note),
    onSuccess: (_, { dishId }) => {
      queryClient.invalidateQueries({ queryKey: ['dishNotes', dishId] });
      toast.success('Saved as dish note');
    },
    onError: () => toast.error('Failed to save note'),
  });

  // Calculate average rating across all preparations
  const allRatings = entry.preparations.flatMap((p) => p.ratings);
  const avgRating =
    allRatings.length > 0
      ? allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length
      : null;

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-stretch">
        {/* Date column */}
        <div className="bg-muted/50 px-4 py-3 flex flex-col items-center justify-center min-w-[80px] border-r">
          <span className="text-sm font-medium text-muted-foreground">{dayName}</span>
          <span className="text-lg font-bold">{date.getDate()}</span>
          <span className="text-xs text-muted-foreground">
            {date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          {/* Type badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <UtensilsCrossed className="h-3 w-3" />
            {ENTRY_TYPE_LABELS[entry.type]}
          </div>

          {/* Main content */}
          {entry.type === 'assembled' && entry.mainDish && (
            <div>
              <h3 className="font-semibold">{entry.mainDish.name}</h3>
              {entry.sideDishes.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  with {entry.sideDishes.map((d) => d.name).join(', ')}
                </p>
              )}
            </div>
          )}

          {entry.type === 'custom' && entry.customText && (
            <p className="font-medium">{entry.customText}</p>
          )}

          {entry.type === 'fend_for_self' && <p className="text-muted-foreground">Fend for self</p>}

          {entry.type === 'dining_out' && (
            <p className="text-muted-foreground">{entry.customText || 'Dining out'}</p>
          )}

          {/* Preparations and ratings */}
          {entry.preparations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed space-y-2">
              {entry.preparations.map((prep) => (
                <div key={prep.id} className="flex items-start gap-2 text-sm">
                  <ChefHat className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {prep.preparers.map((p) => p.name).join(' & ')}
                    </span>
                    {prep.notes && (
                      <div className="mt-0.5">
                        <span className="text-muted-foreground">{prep.notes}</span>
                        {mainDishId && (
                          <button
                            onClick={() =>
                              saveAsNoteMutation.mutate({
                                dishId: mainDishId,
                                note: prep.notes!,
                              })
                            }
                            disabled={saveAsNoteMutation.isPending}
                            className="flex items-center gap-1 mt-1 text-xs text-muted-foreground
                                       hover:text-foreground border border-dashed rounded px-2 py-0.5
                                       hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <BookmarkPlus className="h-3 w-3" />
                            Save as dish note
                          </button>
                        )}
                      </div>
                    )}
                    {prep.ratings.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {prep.ratings.map((rating) => (
                          <div
                            key={rating.id}
                            className="flex items-center gap-1 text-xs bg-muted/50 px-2 py-0.5 rounded"
                          >
                            <StarRating value={rating.stars} size="sm" readonly />
                            <span className="text-muted-foreground">{rating.userName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <PreparationPhotos preparationId={prep.id} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Average rating badge */}
          {avgRating !== null && (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <StarRating value={Math.round(avgRating)} size="sm" readonly />
              <span className="text-muted-foreground">{avgRating.toFixed(1)} avg</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
