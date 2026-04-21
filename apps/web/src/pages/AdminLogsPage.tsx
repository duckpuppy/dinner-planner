import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appEvents, type AppEvent } from '@/lib/api';
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeletonList } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Badge components
// ---------------------------------------------------------------------------

function LevelBadge({ level }: { level: AppEvent['level'] }) {
  const classes = {
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded font-medium', classes[level])}>{level}</span>
  );
}

function CategoryBadge({ category }: { category: AppEvent['category'] }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{category}</span>
  );
}

// ---------------------------------------------------------------------------
// Event row
// ---------------------------------------------------------------------------

function EventRow({ event }: { event: AppEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = event.details !== null && Object.keys(event.details).length > 0;

  return (
    <>
      <tr
        className={cn(
          'border-b last:border-0 hover:bg-muted/30 transition-colors',
          hasDetails && 'cursor-pointer'
        )}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (hasDetails && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        tabIndex={hasDetails ? 0 : undefined}
        role={hasDetails ? 'button' : undefined}
        aria-expanded={hasDetails ? expanded : undefined}
      >
        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          <span title={formatTimestamp(event.createdAt)}>{relativeTime(event.createdAt)}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <LevelBadge level={event.level} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <CategoryBadge category={event.category} />
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className={cn('text-pretty', !expanded && 'line-clamp-2')}>{event.message}</span>
            {hasDetails && (
              <span className="flex-shrink-0 text-muted-foreground" aria-hidden="true">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
          {event.user?.displayName ?? 'System'}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b last:border-0 bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const LEVELS = ['', 'info', 'warn', 'error'] as const;
const CATEGORIES = ['', 'auth', 'admin', 'video', 'cleanup', 'system'] as const;

type LevelFilter = (typeof LEVELS)[number];
type CategoryFilter = (typeof CATEGORIES)[number];

const LEVEL_LABELS: Record<LevelFilter, string> = {
  '': 'All',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
};

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  '': 'All',
  auth: 'Auth',
  admin: 'Admin',
  video: 'Video',
  cleanup: 'Cleanup',
  system: 'System',
};

export function AdminLogsPage() {
  const [level, setLevel] = useState<LevelFilter>('');
  const [category, setCategory] = useState<CategoryFilter>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Debounce search: update on blur or explicit submit
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const applySearch = useCallback(
    (value: string) => {
      if (value !== search) {
        setSearch(value);
        setPage(0);
      }
    },
    [search]
  );

  const handleLevelChange = (v: LevelFilter) => {
    setLevel(v);
    setPage(0);
  };

  const handleCategoryChange = (v: CategoryFilter) => {
    setCategory(v);
    setPage(0);
  };

  const hasFilters = level !== '' || category !== '' || search !== '';

  const clearFilters = () => {
    setLevel('');
    setCategory('');
    setSearchInput('');
    setSearch('');
    setPage(0);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'events', { level, category, search, page }],
    queryFn: () =>
      appEvents.list({
        level: level || undefined,
        category: category || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-balance">Event Log</h1>
          {total > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
              {total.toLocaleString()}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border"
          />
          Auto-refresh
        </label>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Level */}
        <div>
          <label htmlFor="log-level-filter" className="sr-only">
            Filter by level
          </label>
          <select
            id="log-level-filter"
            value={level}
            onChange={(e) => handleLevelChange(e.target.value as LevelFilter)}
            className="px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label htmlFor="log-category-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="log-category-filter"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as CategoryFilter)}
            className="px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <label htmlFor="log-search" className="sr-only">
            Search events
          </label>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="log-search"
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            onBlur={(e) => applySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch(searchInput);
            }}
            placeholder="Search messages..."
            className="w-full pl-10 pr-4 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonList count={8} />
      ) : isError ? (
        <ErrorState
          message="Failed to load events. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-card border rounded-lg">
          <ScrollText
            className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-muted-foreground font-medium">No events found</p>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-3 text-sm text-primary hover:underline">
              Clear filters to see all events
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      User
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground tabular-nums">
                Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
