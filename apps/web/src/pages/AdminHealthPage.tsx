import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, AlertTriangle, Download, HardDrive, Trash2 } from 'lucide-react';
import { appEvents, type SystemHealth } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Storage progress bar
// ---------------------------------------------------------------------------

function storageColor(percent: number): string {
  if (percent >= 80) return 'bg-red-500';
  if (percent >= 60) return 'bg-amber-500';
  return 'bg-green-500';
}

function VideoStorageCard({ storage }: { storage: SystemHealth['videoStorage'] }) {
  const { usedMb, limitMb, percentUsed } = storage;
  const clamped = Math.min(percentUsed, 100);

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="storage-heading">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="storage-heading" className="font-semibold text-foreground text-balance">
          Video Storage
        </h2>
      </div>
      <div
        className="h-3 rounded-full bg-muted overflow-hidden mb-2"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Storage used: ${percentUsed}%`}
      >
        <div
          className={cn('h-full rounded-full transition-all', storageColor(percentUsed))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {usedMb} MB / {limitMb} MB ({percentUsed}%)
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Video jobs card
// ---------------------------------------------------------------------------

interface StatBoxProps {
  label: string;
  value: number;
  colorClass: string;
}

function StatBox({ label, value, colorClass }: StatBoxProps) {
  return (
    <div className="flex flex-col items-center rounded-md bg-muted/50 p-3 gap-1">
      <span className={cn('text-2xl font-bold tabular-nums', colorClass)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function VideoJobsCard({ jobs }: { jobs: SystemHealth['videoJobs'] }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="jobs-heading">
      <div className="flex items-center gap-2 mb-4">
        <Download className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="jobs-heading" className="font-semibold text-foreground text-balance">
          Video Jobs
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBox label="Pending" value={jobs.pending} colorClass="text-blue-500" />
        <StatBox label="Downloading" value={jobs.downloading} colorClass="text-amber-500" />
        <StatBox label="Complete" value={jobs.complete} colorClass="text-green-500" />
        <StatBox label="Failed" value={jobs.failed} colorClass="text-red-500" />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">Total: {jobs.total}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cleanup status card
// ---------------------------------------------------------------------------

function CleanupCard({
  cleanup,
  onRunNow,
  isRunning,
}: {
  cleanup: SystemHealth['cleanup'];
  onRunNow: () => void;
  isRunning: boolean;
}) {
  const freedMb = cleanup.lastResult ? bytesToMb(cleanup.lastResult.freedBytes) : 0;

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="cleanup-heading">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="cleanup-heading" className="font-semibold text-foreground text-balance">
          Video Cleanup
        </h2>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block size-2 rounded-full flex-shrink-0',
              cleanup.schedulerEnabled ? 'bg-green-500' : 'bg-red-500'
            )}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">
            Scheduler:{' '}
            <span className="text-foreground font-medium">{cleanup.schedulerConfig}</span>
          </span>
        </div>

        <div className="text-muted-foreground">
          Last run:{' '}
          <span className="text-foreground font-medium">{relativeTime(cleanup.lastRun)}</span>
        </div>

        {cleanup.lastResult && (
          <div className="text-muted-foreground">
            Last result:{' '}
            <span className="text-foreground font-medium">
              {cleanup.lastResult.deletedFiles === 0
                ? 'No orphaned files'
                : `Deleted ${cleanup.lastResult.deletedFiles} files, freed ${freedMb} MB`}
            </span>
            {cleanup.lastResult.errors > 0 && (
              <span className="ml-2 text-red-500">({cleanup.lastResult.errors} errors)</span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRunNow}
        disabled={isRunning}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isRunning ? 'Running...' : 'Run Now'}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent issues card
// ---------------------------------------------------------------------------

function RecentIssuesCard({ events }: { events: SystemHealth['events'] }) {
  const navigate = useNavigate();

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="issues-heading">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="issues-heading" className="font-semibold text-foreground text-balance">
          Recent Issues
        </h2>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Errors (24h)</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              events.errorsLast24h > 0 ? 'text-red-500' : 'text-foreground'
            )}
          >
            {events.errorsLast24h}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Warnings (24h)</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              events.warningsLast24h > 0 ? 'text-amber-500' : 'text-foreground'
            )}
          >
            {events.warningsLast24h}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Errors (7d)</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              events.errorsLast7d > 0 ? 'text-red-500' : 'text-foreground'
            )}
          >
            {events.errorsLast7d}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/admin/logs?level=error')}
        className="text-sm text-primary hover:underline"
      >
        View Logs
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------

function HealthPageSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AdminHealthPage() {
  const queryClient = useQueryClient();
  const [, setRefreshKey] = useState(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => appEvents.health().then((r) => r.health),
    refetchInterval: 30_000,
  });

  const cleanupMutation = useMutation({
    mutationFn: () => appEvents.triggerCleanup(),
    onSuccess: (result) => {
      const { deletedFiles, freedBytes } = result.result;
      const freedMb = bytesToMb(freedBytes);
      if (deletedFiles === 0) {
        toast.success('Cleanup complete — no orphaned files found');
      } else {
        toast.success(`Cleanup complete — deleted ${deletedFiles} files, freed ${freedMb} MB`);
      }
      void queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
      setRefreshKey((k) => k + 1);
    },
    onError: (err: Error) => {
      toast.error(`Cleanup failed: ${err.message}`);
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground text-balance">System Health</h1>
      </div>

      {isLoading && <HealthPageSkeleton />}

      {isError && (
        <ErrorState
          title="Failed to load health data"
          message="Could not fetch system health information."
          error={error instanceof Error ? error : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VideoStorageCard storage={data.videoStorage} />
          <VideoJobsCard jobs={data.videoJobs} />
          <CleanupCard
            cleanup={data.cleanup}
            onRunNow={() => cleanupMutation.mutate()}
            isRunning={cleanupMutation.isPending}
          />
          <RecentIssuesCard events={data.events} />
        </div>
      )}
    </div>
  );
}
