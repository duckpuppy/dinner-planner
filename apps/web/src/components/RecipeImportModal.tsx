import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Link, Loader2, Video, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { dishes as dishesApi, type CreateDishData, type VideoJob } from '@/lib/api';

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
          if (data.job.extractedRecipe) {
            onImported(data.job.extractedRecipe);
          } else {
            // LLM disabled or failed — build minimal shell from metadata
            const title =
              (data.job.resultMetadata?.title as string | undefined) ?? 'Imported Video Recipe';
            const description = (data.job.resultMetadata?.description as string | undefined) ?? '';
            onImported({
              name: title,
              description,
              type: 'main',
              sourceUrl: data.job.sourceUrl,
              ingredients: [],
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setVideoError(null);
    setVideoJob(null);
    setVideoJobId(null);

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
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6">
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

          {/* Error state */}
          {videoError && (
            <div className="flex items-start gap-2 text-sm text-destructive rounded-md bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
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
                'Import Video'
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
      </div>
    </div>
  );
}
