import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Link, Loader2, Video, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { dishes as dishesApi, ApiError, type CreateDishData, type VideoJob } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  buildFallbackDraft,
  extractionNotice,
  mergeExtractedRecipe,
  NO_VIDEO_NOTICE,
} from '@/lib/videoImport';

const REEXTRACT_POLL_MS = 2000;
/** ~4 minutes of polling before giving up. */
const REEXTRACT_MAX_POLLS = 120;

const VIDEO_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'fb.com',
  'fb.watch',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'vimeo.com',
  'dailymotion.com',
  'twitch.tv',
  'reddit.com',
];

function isVideoUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return VIDEO_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

function statusLabel(job: VideoJob): string {
  switch (job.status) {
    case 'pending':
      return 'Queued...';
    case 'downloading':
      return `Downloading video... ${job.progress}%`;
    case 'extracting':
      return 'Extracting recipe...';
    case 'complete':
      return 'Done!';
    case 'failed':
      return job.error ?? 'Import failed';
    default:
      return 'Processing...';
  }
}

/** Review step state: shown instead of silently opening an empty form. */
interface ReviewState {
  job: VideoJob;
  draft: CreateDishData;
  edited: { name: boolean; description: boolean };
}

interface RecipeImportModalProps {
  onImported: (recipe: CreateDishData) => void;
  onClose: () => void;
}

export function RecipeImportModal({ onImported, onClose }: RecipeImportModalProps) {
  const [url, setUrl] = useState('');
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reextractPolling, setReextractPolling] = useState(false);
  const [reextractStarting, setReextractStarting] = useState(false);
  const [reextractMessage, setReextractMessage] = useState<string | null>(null);

  const isVideoMode = isVideoUrl(url);

  // Recipe URL import (existing flow)
  const importMutation = useMutation({
    mutationFn: (url: string) => dishesApi.importFromUrl(url),
    onSuccess: (data) => {
      onImported(data.recipe);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to import recipe');
    },
  });

  // Video URL import
  const videoImportMutation = useMutation({
    mutationFn: (url: string) => dishesApi.importVideoUrl(url),
    onSuccess: (data) => {
      setVideoJobId(data.jobId);
    },
    onError: (error: Error) => {
      setVideoError(error.message || 'Failed to start video import');
    },
  });

  // Poll job status
  useEffect(() => {
    if (!videoJobId) return;

    function clearPoller() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    intervalRef.current = setInterval(async () => {
      try {
        const data = await dishesApi.getVideoJob(videoJobId);
        setVideoJob(data.job);

        if (data.job.status === 'complete') {
          clearPoller();
          if (data.job.extractedRecipe && !data.job.warning) {
            onImported(data.job.extractedRecipe);
          } else {
            // No recipe, or a metadata-only import: show what happened before the form opens.
            setReview({
              job: data.job,
              draft: data.job.extractedRecipe ?? buildFallbackDraft(data.job),
              edited: { name: false, description: false },
            });
          }
        } else if (data.job.status === 'failed') {
          clearPoller();
          setVideoError(data.job.error ?? 'Video import failed');
        }
      } catch (err) {
        clearPoller();
        setVideoError(err instanceof Error ? err.message : 'Failed to check job status');
      }
    }, 2000);

    return () => clearPoller();
  }, [videoJobId, onImported]);

  // Poll after a re-extract request until the job leaves 'extracting' (or we give up).
  const reviewJobId = review?.job.id;
  useEffect(() => {
    if (!reextractPolling || !reviewJobId) return;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      try {
        const { job } = await dishesApi.getVideoJob(reviewJobId);
        if (job.status === 'extracting') {
          if (polls >= REEXTRACT_MAX_POLLS) {
            clearInterval(timer);
            setReextractPolling(false);
            setReextractMessage(
              'Extraction is taking longer than expected. Try again in a few minutes.'
            );
          }
          return;
        }
        clearInterval(timer);
        setReextractPolling(false);
        setReview((prev) => {
          if (!prev) return prev;
          const recipe = job.extractedRecipe;
          return {
            ...prev,
            job,
            draft: recipe ? mergeExtractedRecipe(prev.draft, recipe, prev.edited) : prev.draft,
          };
        });
        setReextractMessage(
          job.extractedRecipe
            ? 'Recipe extracted. Review the details, then continue.'
            : job.extractionStatus === 'failed'
              ? 'Extraction failed again.'
              : null
        );
      } catch (err) {
        clearInterval(timer);
        setReextractPolling(false);
        setReextractMessage(err instanceof Error ? err.message : 'Failed to check job status');
      }
    }, REEXTRACT_POLL_MS);
    return () => clearInterval(timer);
  }, [reextractPolling, reviewJobId]);

  async function handleReextract() {
    if (!review) return;
    setReextractMessage(null);
    setReextractStarting(true);
    try {
      await dishesApi.reextractVideoJob(review.job.id);
      setReextractPolling(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already running (perhaps from another tab) - just wait for it.
        setReextractPolling(true);
      } else if (err instanceof ApiError && err.status === 429) {
        setReextractMessage('Too many attempts. Please try again in a minute.');
      } else {
        setReextractMessage(err instanceof Error ? err.message : 'Failed to start extraction');
      }
    } finally {
      setReextractStarting(false);
    }
  }

  function updateDraft(field: 'name' | 'description', value: string) {
    setReview((prev) =>
      prev
        ? {
            ...prev,
            draft: { ...prev.draft, [field]: value },
            edited: { ...prev.edited, [field]: true },
          }
        : prev
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setVideoError(null);
    setVideoJob(null);
    setVideoJobId(null);
    setReview(null);
    setReextractMessage(null);

    if (isVideoMode) {
      videoImportMutation.mutate(trimmed);
    } else {
      importMutation.mutate(trimmed);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  const isProcessing =
    importMutation.isPending ||
    videoImportMutation.isPending ||
    (videoJobId !== null && videoJob?.status !== 'complete' && videoJob?.status !== 'failed');

  const isVideoProcessing =
    videoImportMutation.isPending ||
    (videoJobId !== null &&
      videoJob !== null &&
      videoJob.status !== 'complete' &&
      videoJob.status !== 'failed');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="presentation"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 max-h-dvh overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isVideoMode ? (
              <Video className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Link className="h-5 w-5 text-muted-foreground" />
            )}
            <h2 className="text-lg font-semibold">
              {isVideoMode ? 'Import Recipe from Video' : 'Import Recipe from URL'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md"
            aria-label="Close"
            disabled={isProcessing}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {review ? (
          <ReviewPanel
            review={review}
            busy={reextractPolling || reextractStarting}
            message={reextractMessage}
            onChange={updateDraft}
            onReextract={handleReextract}
            onContinue={() => onImported(review.draft)}
            onCancel={onClose}
          />
        ) : (
          <>
            {isVideoMode ? (
              <p className="text-sm text-muted-foreground mb-4">
                Paste a video URL from YouTube, Instagram, TikTok, and more. The video will be
                downloaded and recipe details extracted automatically if AI is enabled.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">
                Paste a recipe URL to automatically import the recipe details. Supports sites with
                structured recipe data (AllRecipes, Serious Eats, BBC Food, etc.).
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="recipe-url">
                  {isVideoMode ? 'Video URL' : 'Recipe URL'}
                </label>
                <input
                  id="recipe-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                    isVideoMode ? 'https://youtube.com/watch?v=...' : 'https://example.com/recipe'
                  }
                  required
                  autoFocus
                  disabled={isProcessing}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>

              {/* Video job progress */}
              {isVideoProcessing && videoJob && (
                <div className="rounded-md bg-muted p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>{statusLabel(videoJob)}</span>
                  </div>
                  {videoJob.status === 'downloading' && (
                    <div className="h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${videoJob.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Queued / starting state before first job poll */}
              {videoImportMutation.isPending && !videoJob && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md bg-muted p-3">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Starting import...</span>
                </div>
              )}

              {/* Error state (a failed download shows the server's friendly message as-is) */}
              {videoError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-sm text-destructive rounded-md bg-destructive/10 p-3"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{videoError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isProcessing || !url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isVideoMode ? 'Importing...' : 'Fetching...'}
                    </>
                  ) : isVideoMode ? (
                    videoError ? (
                      'Try another link'
                    ) : (
                      'Import Video'
                    )
                  ) : (
                    'Fetch Recipe'
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="py-2 px-4 border rounded-md hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

interface ReviewPanelProps {
  review: ReviewState;
  busy: boolean;
  message: string | null;
  onChange: (field: 'name' | 'description', value: string) => void;
  onReextract: () => void;
  onContinue: () => void;
  onCancel: () => void;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 text-sm rounded-md bg-muted p-3">
      <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function ReviewPanel({
  review,
  busy,
  message,
  onChange,
  onReextract,
  onContinue,
  onCancel,
}: ReviewPanelProps) {
  const { job, draft } = review;
  const hasRecipe = job.extractionStatus === 'llm' && !!job.extractedRecipe;
  const notice = hasRecipe ? null : extractionNotice(job);
  const canRetry =
    !hasRecipe && (job.extractionStatus === 'failed' || job.extractionStatus === 'no_description');

  return (
    <div className="space-y-4">
      {job.warning && <Notice>{NO_VIDEO_NOTICE}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {busy && (
        <div role="status" className="flex items-center gap-2 text-sm rounded-md bg-muted p-3">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
          <span>Extracting recipe...</span>
        </div>
      )}
      {message && !busy && <Notice>{message}</Notice>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="import-draft-name">
          Dish name
        </label>
        <input
          id="import-draft-name"
          type="text"
          value={draft.name}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="import-draft-description">
          Description
        </label>
        <textarea
          id="import-draft-description"
          value={draft.description ?? ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={5}
          className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className={cn(
            'flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium',
            'hover:bg-primary/90 disabled:opacity-50'
          )}
        >
          Continue to dish form
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={onReextract}
            disabled={busy}
            className="py-2 px-4 border rounded-md hover:bg-muted disabled:opacity-50"
          >
            Try extraction again
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="py-2 px-4 border rounded-md hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
