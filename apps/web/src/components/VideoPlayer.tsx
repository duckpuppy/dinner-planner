import { useState } from 'react';
import { AlertCircle, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/apiOrigin';

interface VideoPlayerProps {
  /** Filename in the public /videos/ static directory (dish.localVideoFilename). */
  videoFilename: string;
  thumbnailFilename?: string | null;
  className?: string;
}

export function VideoPlayer({ videoFilename, thumbnailFilename, className }: VideoPlayerProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg bg-muted p-6 text-muted-foreground',
          className
        )}
      >
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Video unavailable</p>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-black', className)}>
      <video
        src={mediaUrl(`/videos/${videoFilename}`)}
        poster={thumbnailFilename ? mediaUrl(`/videos/${thumbnailFilename}`) : undefined}
        controls
        playsInline
        preload="metadata"
        onError={() => setError(true)}
        className="w-full rounded-lg"
        aria-label="Dish video"
      >
        <p className="text-sm text-muted-foreground p-4">
          Your browser does not support HTML5 video.
        </p>
      </video>
      {!thumbnailFilename && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
          <Video className="h-12 w-12 text-white" />
        </div>
      )}
    </div>
  );
}
